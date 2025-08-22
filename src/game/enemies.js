import { game } from './core.js';
import { subscribeToEnemies } from '../services/enemyService.js';
import { experienceManager } from './experienceManager.js';
import { ENEMY_HP, DAMAGE_PER_HIT } from '../utils/constants.js';
import enemyTemplates from '../data/enemies.js';
import { playCoinSound, playBugDeathSound } from '../utils/sfx.js';
import { inventoryManager } from './inventoryManager.js';
import { createGoldDrop, updateGoldDrops, drawGoldDrops } from './goldDrops.js';
import { database } from '../utils/firebaseClient.js';
import { ref, runTransaction } from 'firebase/database';
import { highlightManager } from './highlightManager.js';
import { trackDamage } from '../services/groundItemService.js';

/**
 * Enemy Management System
 *
 * ENEMY RESPAWNING REMOVED:
 * - 20 enemies spawn once at startup
 * - Dead enemies are gone forever (no respawning)
 * - All enemies are static (no movement or fleeing)
 *
 * Core Design:
 * - Server spawns 20 enemies once, manages death cleanup
 * - Client displays static enemies and handles damage feedback
 * - Firebase RTDB syncs enemy state changes
 * - Dead enemies are permanently removed
 * - Health values are server-authoritative
 */

// Active enemy storage - synced from server via Firebase RTDB
const enemies = new Map();
let targetedEnemy = null;
let enemyUnsubscribe = null;
// Current area id for client-side template lookups (set in initEnemies)
let currentAreaId = 'beach';
// Counter for periodic health validation
let validationCounter = 0;

// Note: visual and tunable properties are now supplied by templates in
// `src/data/enemies.json`. The server should write runtime fields (x,y,hp)
// while the client fills in display fields from the template when missing.

// Death animation configuration
const DEATH_FADE_DURATION = 1000; // 1 second fade before removal
const DEATH_SCALE_SHRINK = 0.3; // Shrink to 30% during death

/**
 * Comprehensive health validation function to ensure enemy health integrity
 * @param {Object} enemy - Enemy object to validate
 * @returns {boolean} - True if health values are valid, false otherwise
 */
function validateEnemyHealth(enemy) {
    if (!enemy || typeof enemy !== 'object') {
        console.error('[ENEMY_VALIDATION] Invalid enemy object:', enemy);
        return false;
    }

    // Ensure HP is a finite number
    if (!Number.isFinite(enemy.hp)) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} has non-finite HP: ${enemy.hp}. Setting to 0.`);
        enemy.hp = 0;
    }

    // Ensure maxHP is a finite positive number
    if (!Number.isFinite(enemy.maxHp) || enemy.maxHp <= 0) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} has invalid maxHP: ${enemy.maxHp}. Setting to ${ENEMY_HP}.`);
        enemy.maxHp = ENEMY_HP;
    }

    // Ensure HP is within valid range
    if (enemy.hp < 0) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} has negative HP: ${enemy.hp}. Setting to 0.`);
        enemy.hp = 0;
    }

    if (enemy.hp > enemy.maxHp) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} has HP > maxHP: ${enemy.hp}/${enemy.maxHp}. Capping at maxHP.`);
        enemy.hp = enemy.maxHp;
    }

    // Check for death state consistency
    if (enemy.hp <= 0 && !enemy.isDead) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} has HP <= 0 but is not marked as dead. Fixing...`);
        enemy.isDead = true;
        enemy.deathProcessed = true;
        enemy.hp = 0;
    }

    if (enemy.isDead && enemy.hp > 0) {
        console.warn(`[ENEMY_VALIDATION] Enemy ${enemy.id} is marked as dead but has HP > 0: ${enemy.hp}. Fixing...`);
        enemy.hp = 0;
    }

    return true;
}

/**
 * Initializes the enemy system with clean server-client sync.
 * 
 * Server responsibilities:
 * - Enemy spawning, movement, and death detection
 * - Health management and respawn timing
 * 
 * Client responsibilities:
 * - Visual representation and smooth rendering
 * - Immediate damage feedback before server confirms
 * - Death animations and cleanup
 */
export function initEnemies() {
    // Clean up existing state
    enemies.clear();
    targetedEnemy = null;
    
    if (enemyUnsubscribe) {
        enemyUnsubscribe();
        enemyUnsubscribe = null;
    }
    
    const currentArea = 'beach';
    currentAreaId = currentArea; // persist for template lookups when server entries lack templateId
    console.log(`Initializing enemy system for area: ${currentArea}`);

    enemyUnsubscribe = subscribeToEnemies(currentArea, handleEnemySync);
}

/**
 * Updates the game object's enemies array for DOM rendering.
 * This ensures the renderEnemiesAsDOM function has access to current enemy data.
 */
function updateGameEnemies() {
    // Update game.enemies with current enemies (using static import)
    game.enemies = Array.from(enemies.values());
}

/**
 * Handles enemy data synchronization from Firebase RTDB.
 * Implements clean separation between server state and client representation.
 *
 * @param {Object|null} enemyData - Enemy data from Firebase RTDB
 */
function handleEnemySync(enemyData) {
    console.log(`[ENEMY_SYNC] Received sync data with ${enemyData ? Object.keys(enemyData).length : 0} enemies`);

    if (!enemyData) {
        // No enemies on server - clear all local enemies
        console.log('[ENEMY_SYNC] No enemies on server, clearing all local enemies');
        enemies.clear();
        if (targetedEnemy) {
            targetedEnemy = null;
        }
        return;
    }
    
    const serverEnemies = Object.entries(enemyData);
    const serverIds = new Set(serverEnemies.map(([id]) => id));
    
    // Identify local enemies that no longer exist on the server (i.e., they died or despawned on server)
    // or whose HP dropped to zero on the server (which might not have triggered a local death yet).
    const enemiesToRemove = [];
    for (const [enemyId, localEnemy] of enemies) {
        const serverEntry = enemyData[enemyId];
        // If enemy doesn't exist on server OR server reports it as dead
        if (!serverEntry || serverEntry.hp <= 0 || serverEntry.isDead === true) {
            if (!localEnemy.isDead) { // Only log if we're marking it dead now
                console.log(`[ENEMY_SYNC] Enemy ${enemyId} is dead on server or missing, triggering local death.`);
                triggerEnemyDeath(localEnemy); // Ensure local death processing and rewards
            }
            // Mark for removal if its fade animation is complete OR it's been explicitly removed from server.
            // If deathFade is undefined, it means the death animation hasn't started, or it's not applicable (e.g., initial sync of dead enemy).
            // We'll let updateEnemyAnimations handle the final removal after the fade.
            if (!serverEntry || (localEnemy.isDead && localEnemy.deathFade <= 0)) {
                enemiesToRemove.push(enemyId);
            }
        }
    }

    for (const enemyId of enemiesToRemove) {
        if (targetedEnemy?.id === enemyId) {
            targetedEnemy = null;
        }
        enemies.delete(enemyId);
        console.log(`[ENEMY_SYNC] Removed locally faded/missing enemy: ${enemyId}`);
    }
    
    // Add/update enemies from server data
    for (const [enemyId, serverEnemy] of serverEnemies) {
        // Skip if enemy is explicitly dead on server (it will be removed by logic above)
        if (serverEnemy.hp <= 0 || serverEnemy.isDead === true) {
            continue;
        }
        
        const localEnemy = enemies.get(enemyId);
        
        if (localEnemy) {
            // Only update if not already dead locally
            if (!localEnemy.isDead) {
                updateLocalEnemyFromServer(localEnemy, serverEnemy);
            } else {
                console.log(`[ENEMY_SYNC] Ignoring update for locally dead enemy ${enemyId}.`);
            }
        } else {
            // Add new enemy by merging server state with a template.
            let template = null;
            if (serverEnemy.templateId) {
                template = enemyTemplates.getTemplateById(serverEnemy.templateId);
            } else {
                // Choose a weighted template for this area so client visuals are sensible
                const areaTemplates = enemyTemplates.getTemplatesForArea(currentAreaId || 'beach');
                template = enemyTemplates.chooseWeightedTemplate(areaTemplates) || null;
                if (!template) {
                    console.warn(`[ENEMY_SYNC] No template found for enemy ${enemyId}, falling back to default.`);
                }
            }

            const newEnemy = createLocalEnemyFromTemplate(serverEnemy, template || null, enemyId);
            
            // Ensure health is valid and enemy is not already "dead" upon creation
            if (newEnemy.hp > 0) {
                enemies.set(enemyId, newEnemy);
                console.log(`[ENEMY_SYNC] Added new enemy: ${enemyId} (HP: ${newEnemy.hp}/${newEnemy.maxHp}, template=${template?.id || serverEnemy.templateId || 'none'})`);
            } else {
                console.log(`[ENEMY_SYNC] Not adding enemy ${enemyId} - it's already dead on server (HP: ${newEnemy.hp}).`);
            }
        }
    }
}

/**
 * Updates local enemy state from server data.
 * Maintains client-authoritative death state to prevent resurrection.
 * 
 * @param {Object} localEnemy - Local enemy object
 * @param {Object} serverEnemy - Server enemy data
 */
function updateLocalEnemyFromServer(localEnemy, serverEnemy) {
    // Once dead locally, ignore all server updates (prevents resurrection)
    if (localEnemy.isDead) {
        console.log(`[ENEMY_UPDATE] Ignoring server update for dead enemy ${localEnemy.id}`);
        return;
    }

    // Update position directly (static enemies don't move)
    localEnemy.x = serverEnemy.x;
    localEnemy.y = serverEnemy.y;
    localEnemy.angle = serverEnemy.angle || localEnemy.angle;
    localEnemy.lastUpdate = serverEnemy.lastUpdate || Date.now();

    // CRITICAL: Health can only decrease and server HP is authoritative.
    // Validate server HP to ensure it's a number and non-negative.
    const serverHp = typeof serverEnemy.hp === 'number' && !isNaN(serverEnemy.hp) ? serverEnemy.hp : localEnemy.hp;
    const newHp = Math.max(0, serverHp);

    // Only update HP if it's decreasing.
    if (newHp < localEnemy.hp) {
        const previousHp = localEnemy.hp;
        localEnemy.hp = newHp;
        console.log(`[ENEMY_UPDATE] Enemy ${localEnemy.id} HP: ${previousHp} -> ${newHp}`);

        // Trigger death if HP reaches 0
        if (localEnemy.hp <= 0) {
            console.log(`[ENEMY_UPDATE] Triggering death for enemy ${localEnemy.id}`);
            triggerEnemyDeath(localEnemy);
        }
    } else if (newHp > localEnemy.hp) {
        console.log(`[ENEMY_UPDATE] Ignoring HP increase for enemy ${localEnemy.id}: ${localEnemy.hp} -> ${newHp} (would be resurrection)`);
    } else {
        // HP is the same, no change needed.
    }
}

/**
 * Creates a new local enemy from server data.
 * 
 * @param {string} enemyId - Enemy identifier
 * @param {Object} serverEnemy - Server enemy data
 * @returns {Object} Local enemy object
 */
/**
 * Create a local enemy object combining server authoritative state and
 * optional template defaults. Server state always wins for logic fields
 * such as `hp`, `x`, `y`. Template supplies visuals and tunables.
 *
 * @param {Object} serverEnemy - enemy object from server RTDB
 * @param {Object|string|null} templateOrId - template object or template id
 * @param {string} overrideId - optional explicit id when template lacks it
 */
function createLocalEnemyFromTemplate(serverEnemy = {}, templateOrId = null, overrideId = null) {
    const template = typeof templateOrId === 'string' ? enemyTemplates.getTemplateById(templateOrId) : templateOrId;

    // Base properties from server, prioritize server values
    const id = overrideId || serverEnemy.id || (template ? template.id : String(Math.random()).slice(2));
    const x = serverEnemy.x ?? 0;
    const y = serverEnemy.y ?? 0;
    const angle = serverEnemy.angle ?? 0;
    const lastUpdate = serverEnemy.lastUpdate ?? Date.now();

    // Health: Server is authoritative. If server provides it, use it. Otherwise, use template.
    // Ensure hp is never negative and never exceeds maxHp.
    let resolvedMaxHp = (typeof serverEnemy.maxHp === 'number' && !isNaN(serverEnemy.maxHp) && serverEnemy.maxHp > 0) ? serverEnemy.maxHp : (template?.maxHp || template?.hp || ENEMY_HP);
    let resolvedHp = (typeof serverEnemy.hp === 'number' && !isNaN(serverEnemy.hp)) ? serverEnemy.hp : resolvedMaxHp;
    resolvedHp = Math.max(0, Math.min(resolvedHp, resolvedMaxHp)); // Clamp HP to [0, maxHp]

    // Derive isDead state from resolved HP
    const isDead = resolvedHp <= 0;

    // Visual and tunable properties from template, with fallbacks
    const size = template?.size || 4;
    const color = template?.color || '#000';
    const shadowColor = template?.shadowColor || 'rgba(0,0,0,0.25)';
    const xpValue = serverEnemy.xpValue ?? template?.xpValue ?? 0;
    const behavior = serverEnemy.behavior ?? template?.behavior ?? 'passive';
    const loot = serverEnemy.loot ?? template?.loot ?? { goldMin: 0, goldMax: 0 };

    return {
        id,
        x,
        y,
        hp: resolvedHp,
        maxHp: resolvedMaxHp,
        angle,
        size,
        color,
        shadowColor,
        legPhase: Math.random() * Math.PI * 2, // Always randomize leg phase for animation
        xpValue,
        behavior,
        loot,
        isDead, // Derived from HP
        lastUpdate,
        deathProcessed: isDead, // If created dead, consider death processed
        rewardsGranted: isDead // If created dead, rewards are implicitly granted (or none to give)
    };
}

/**
 * Handles enemy death with server-driven item drops and immediate visual feedback.
 *
 * Server-driven approach:
 * - Item drops are managed by the server and added to groundItems database
 * - Client subscribes to groundItems changes for item spawning
 * - No local item spawning - all items come from server subscription
 * - Immediate XP/gold rewards for responsive gameplay
 * - Visual effects (gold drops, sounds) for immediate feedback
 *
 * @param {Object} enemy - Enemy object that died
 */
function triggerEnemyDeath(enemy) {
    if (enemy.isDead && enemy.deathProcessed) {
        console.log(`[ENEMY_DEATH] Death already fully processed for enemy ${enemy.id}.`);
        return; // Already processed and awards given
    }

    // Ensure health is 0 and mark as dead
    enemy.hp = 0;
    enemy.isDead = true;

    // Set death start time only once to ensure fade animation starts consistently
    if (!enemy.deathStartTime) {
        enemy.deathStartTime = Date.now();
        console.log(`[ENEMY_DEATH] Starting death animation for enemy ${enemy.id}.`);
    } else {
        console.log(`[ENEMY_DEATH] Enemy ${enemy.id} already started death animation.`);
    }

    // Clear targeting if this enemy was targeted
    if (targetedEnemy?.id === enemy.id) {
        console.log(`[ENEMY_DEATH] Clearing target for dead enemy ${enemy.id}.`);
        targetedEnemy = null;
    }

    // Award immediate rewards only if not already granted
    if (!enemy.rewardsGranted) {
        const goldAmount = Math.floor(Math.random() * (enemy.loot.goldMax - enemy.loot.goldMin + 1)) + enemy.loot.goldMin;
        const xpAmount = enemy.xpValue || 10;

        console.log(`[ENEMY_DEATH] Granting immediate rewards for enemy ${enemy.id}: ${xpAmount} XP, ${goldAmount} gold.`);

        // Immediate XP reward for responsive feedback
        if (xpAmount > 0) {
            experienceManager.addXenohuntingExp(xpAmount);
        }

        // Immediate XP reward for responsive feedback only. DO NOT grant any
        // inventory items, gold, or ground-item visuals here — those must be
        // created by the server as ground items so visibility can be restricted
        // to damage contributors. Granting items locally causes desyncs and
        // popup notifications that bypass server-authoritative drops.
        if (xpAmount > 0) {
            experienceManager.addXenohuntingExp(xpAmount);
        }

        // Play death sound for responsive feedback only
        playBugDeathSound();

        // Mark rewardsGranted to prevent duplicate immediate client-side grants
        // (we still rely on the server to create actual dropped items).
        enemy.rewardsGranted = true;
    } else {
        console.log(`[ENEMY_DEATH] Rewards already granted for enemy ${enemy.id}.`);
    }

    // Enemy drops are handled server-side through the damage tracking system
    // The server will create ground items based on loot tables when damage is tracked
    // This ensures proper synchronization and prevents desync issues
    if (!enemy.dropsProcessed) {
        console.log(`[ENEMY_DEATH] Enemy ${enemy.id} drops will be handled server-side via damage tracking`);

        // Permanent fix: Do NOT call `trackDamage(..., 0)` here. The server is
        // authoritative and will create drops after processing positive damage
        // transactions. Sending a death-finalization (damage=0) from the client
        // caused transaction conflicts. Clients should only send positive damage
        // values and rely on the RTDB sync for final state.

        // Mark as processed locally so we don't attempt client-side finalization
        enemy.dropsProcessed = true;
    } else {
        console.log(`[ENEMY_DEATH] Drops already processed for enemy ${enemy.id}.`);
    }

    enemy.deathProcessed = true; // Mark as processed after rewards are granted
}

/**
 * Updates visual effects and client-side animations.
 * Server handles all logical enemy updates (position, health, etc.).
 * 
 * @param {number} dt - Delta time since last frame
 */
function updateEnemyAnimations(dt) {
    const now = Date.now();
    
    // Use Array.from to iterate over a copy, allowing modification during loop
    for (const enemy of Array.from(enemies.values())) {
        // Update leg animation for living enemies only
        if (!enemy.isDead) {
            enemy.legPhase = (enemy.legPhase + dt * 3) % (Math.PI * 2);
        }
        
        // Handle death fade animation
        if (enemy.isDead && enemy.deathStartTime) {
            const deathElapsed = now - enemy.deathStartTime;
            enemy.deathFade = Math.max(0, 1 - (deathElapsed / DEATH_FADE_DURATION));
            
            // Remove enemy from the map only after the animation completes
            if (deathElapsed >= DEATH_FADE_DURATION) {
                if (targetedEnemy?.id === enemy.id) { // Ensure targeted enemy is cleared if it's the one being removed
                    targetedEnemy = null;
                }
                enemies.delete(enemy.id);
                console.log(`[ENEMY_ANIMATION] Removed completely faded enemy: ${enemy.id}`);
            }
        } else if (enemy.isDead && !enemy.deathStartTime) {
            // If enemy is dead but deathStartTime wasn't set (e.g., received already dead from server)
            // Immediately remove it as there's no animation to play.
            if (targetedEnemy?.id === enemy.id) {
                targetedEnemy = null;
            }
            enemies.delete(enemy.id);
            console.log(`[ENEMY_ANIMATION] Immediately removed server-dead enemy without animation: ${enemy.id}`);
        }
    }
    // AI: Update the game object's enemies array after sync
    updateGameEnemies();
}


/**
 * Updates enemy system with clean separation of concerns.
 * Server manages logic, client handles visuals and immediate feedback.
 * 
 * @param {number} dt - Delta time since last frame
 */
export function updateEnemies(dt) {
    // No need for periodic health validation here; handled by handleEnemySync for server data
    // and damageEnemy for local health changes.
    validationCounter++; // Still increment, but logic is simplified
    if (validationCounter % 100 === 0) {
        // This block can be used for other periodic maintenance if needed
    }

    // Update visual animations and effects (static enemies still animate)
    updateEnemyAnimations(dt);

    // Update gold drop animations
    updateGoldDrops(dt);
}

/**
 * Renders all active enemies with proper visual effects.
 * Handles death animations, targeting indicators, and combat feedback.
 */
export function drawEnemies() {
    const { ctx } = game;
    if (!ctx) return;

    for (const [enemyId, enemy] of enemies) {
        // Skip completely faded enemies
        if (enemy.isDead && enemy.deathFade <= 0) {
            continue;
        }
        
        ctx.save();
        
        // Apply death fade effect
        if (enemy.isDead && typeof enemy.deathFade === 'number') {
            ctx.globalAlpha = enemy.deathFade;
            // Apply death shrink effect
            const shrinkScale = 1 - (1 - enemy.deathFade) * (1 - DEATH_SCALE_SHRINK);
            ctx.translate(enemy.x, enemy.y);
            ctx.scale(shrinkScale, shrinkScale);
            ctx.translate(-enemy.x, -enemy.y);
        }
        
        drawEnemySprite(enemy);

        // Add highlight support using highlightManager
        if (highlightManager.isHighlighted(enemy)) {
          drawEnemyHighlight(enemy);
        }

        drawEnemyUI(enemy);
        
        ctx.restore();
    }
    
    // Draw gold drop effects
    drawGoldDrops();
}

/**
 * Draws the visual representation of an enemy as a tiny pixel critter alien.
 *
 * @param {Object} enemy - Enemy to draw
 */
function drawEnemySprite(enemy) {
    const { ctx } = game;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    // Apply 2.5D height effect - slight vertical squash and height offset
    const heightOffset = -enemy.size * 0.3; // Lift slightly off ground
    ctx.translate(0, heightOffset);
    ctx.scale(1, 0.7); // Subtle vertical squash for 2.5D effect

    ctx.rotate(enemy.angle + Math.PI / 2);

    // Draw shadow - fitting pixel shadow for alien critter
    ctx.fillStyle = enemy.shadowColor || 'rgba(0, 0, 0, 0.25)';

    // Create a more fitting shadow shape - slightly oval and alien-like
    ctx.beginPath();
    ctx.ellipse(0, enemy.size * 0.9, enemy.size * 0.9, enemy.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Add a subtle inner shadow for depth
    ctx.fillStyle = enemy.shadowColor || 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(0, enemy.size * 0.85, enemy.size * 0.6, enemy.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body color
    const bodyColor = enemy.color;

    // Draw tiny alien body - pixel art style
    const pixelSize = enemy.size * 0.3;

    // Body - main rectangle
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-enemy.size * 0.6, -enemy.size * 0.4, enemy.size * 1.2, enemy.size * 0.8);

    // Alien head - smaller rectangle on top
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-enemy.size * 0.4, -enemy.size * 0.8, enemy.size * 0.8, enemy.size * 0.6);

    // Eyes - tiny glowing pixels
    ctx.fillStyle = '#FFFF00'; // Bright yellow eyes
    ctx.fillRect(-enemy.size * 0.2, -enemy.size * 0.6, pixelSize * 0.8, pixelSize * 0.8);
    ctx.fillRect(enemy.size * 0.1, -enemy.size * 0.6, pixelSize * 0.8, pixelSize * 0.8);

    // Antennae - simple lines
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 1;

    // Left antenna
    ctx.beginPath();
    ctx.moveTo(-enemy.size * 0.3, -enemy.size * 0.9);
    ctx.lineTo(-enemy.size * 0.5, -enemy.size * 1.3);
    ctx.stroke();

    // Right antenna
    ctx.beginPath();
    ctx.moveTo(enemy.size * 0.3, -enemy.size * 0.9);
    ctx.lineTo(enemy.size * 0.5, -enemy.size * 1.3);
    ctx.stroke();

    // Tiny antenna tips (alien sensors)
    ctx.fillStyle = '#FF6B6B'; // Red sensor dots
    ctx.fillRect(-enemy.size * 0.6, -enemy.size * 1.4, pixelSize * 0.6, pixelSize * 0.6);
    ctx.fillRect(enemy.size * 0.4, -enemy.size * 1.4, pixelSize * 0.6, pixelSize * 0.6);

    // Legs - simple pixel lines (only for living enemies)
    if (!enemy.isDead) {
        const legAngle = Math.sin(enemy.legPhase) * 0.3;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1;

        // Three pairs of legs
        for (let i = 0; i < 3; i++) {
            const y = (i - 1) * enemy.size * 0.3;
            const x = Math.cos(legAngle + i * Math.PI / 2) * enemy.size * 0.4;

            // Left leg
            ctx.beginPath();
            ctx.moveTo(-enemy.size * 0.3, y);
            ctx.lineTo(-enemy.size * 0.3 + x, y - enemy.size * 0.2);
            ctx.stroke();

            // Right leg
            ctx.beginPath();
            ctx.moveTo(enemy.size * 0.3, y);
            ctx.lineTo(enemy.size * 0.3 - x, y - enemy.size * 0.2);
            ctx.stroke();
        }
    }

    // Tiny alien details - random blinking effect
    if (!enemy.isDead && Math.random() < 0.05) {
        // Occasional eye glow
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-enemy.size * 0.2, -enemy.size * 0.6, pixelSize * 0.4, pixelSize * 0.4);
        ctx.fillRect(enemy.size * 0.1, -enemy.size * 0.6, pixelSize * 0.4, pixelSize * 0.4);
    }

    ctx.restore();
}

// Fleeing effects removed - enemies don't move or flee

// drawFleeingEffects function removed - enemies don't flee

/**
 * Draws enemy UI elements (health bar, targeting indicator).
 *
 * @param {Object} enemy - Enemy to draw UI for
 */
function drawEnemyUI(enemy) {
    const { ctx } = game;

    // Only draw UI for living enemies
    if (enemy.isDead) {
        return;
    }

    // Draw health bar for damaged enemies
    if (enemy.hp < enemy.maxHp) {
        const barWidth = enemy.size * 2;
        const barHeight = 3;
        const barX = enemy.x - barWidth / 2;
        const barY = enemy.y - enemy.size * 2;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health bar
        ctx.fillStyle = 'red';
        const healthRatio = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
    }

    // Draw targeting circle for selected enemy
    if (targetedEnemy?.id === enemy.id) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y + enemy.size * 0.7);
        ctx.scale(1, 0.4); // 2.5D perspective effect

        ctx.beginPath();
        ctx.arc(0, 0, enemy.size * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }
}

/**
 * Draws highlight outline around an enemy when highlighted.
 *
 * @param {Object} enemy - Enemy to draw highlight for
 */
function drawEnemyHighlight(enemy) {
    const { ctx } = game;

    ctx.save();

    // Draw glowing highlight outline around enemy
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'; // Gold color for highlight
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
    ctx.shadowBlur = 6;

    // Draw circle outline around enemy
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.size * 1.2, 0, Math.PI * 2);
    ctx.stroke();

    // Add a second, more subtle inner glow
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.size * 1.1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

/**
 * Sets the targeted enemy.
 * @param {object | null} enemy - The enemy to target, or null to clear.
 */
export function setTargetedEnemy(enemy) {
    targetedEnemy = enemy;
}

/**
 * Gets the currently targeted enemy.
 * @returns {object | null} The targeted enemy, or null if none.
 */
export function getTargetedEnemy() {
    return targetedEnemy;
}

/**
 * Finds the nearest living enemy to a given point.
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object|null} Nearest living enemy or null
 */
export function findNearestEnemy(x, y) {
    let nearestEnemy = null;
    let minDistance = Infinity;

    for (const enemy of enemies.values()) {
        // Only consider living enemies
        if (enemy.isDead || enemy.hp <= 0) {
            continue;
        }
        
        const distance = Math.hypot(enemy.x - x, enemy.y - y);
        if (distance < minDistance) {
            minDistance = distance;
            nearestEnemy = enemy;
        }
    }

    return nearestEnemy;
}

/**
 * Gets all active enemies as an array.
 * @returns {Array} Array of enemy objects
 */
export function getEnemies() {
    return Array.from(enemies.values());
}

/**
 * Applies damage to an enemy with immediate client feedback.
 * Updates server state via Firebase transaction for authority.
 * 
 * @param {Object} enemy - Enemy to damage
 * @param {number} amount - Damage amount
 */
export function damageEnemy(enemy, amount) {
    if (!enemy?.id || amount <= 0 || enemy.isDead) { // Check enemy.isDead here
        console.log(`[ENEMY_DAMAGE] Skipping damage to ${enemy?.id || 'unknown'} (dead/invalid: ${enemy?.isDead}, hp: ${enemy?.hp})`);
        return;
    }

    console.log(`[ENEMY_DAMAGE] Attempting to damage enemy ${enemy.id}: ${enemy.hp} HP - ${amount} damage`);

    // Prevent multiple simultaneous damage to same enemy
    if (enemy.damageInProgress) {
        console.log(`[ENEMY_DAMAGE] Damage already in progress for enemy ${enemy.id}`);
        return;
    }

    enemy.damageInProgress = true;

    // No need for pre-validation here, `createLocalEnemyFromTemplate` and `updateLocalEnemyFromServer` handle it.

    // Apply damage immediately for visual feedback
    const newHp = Math.max(0, enemy.hp - amount);
    const previousHp = enemy.hp;
    enemy.hp = newHp;

    console.log(`[ENEMY_DAMAGE] Applied immediate damage to enemy ${enemy.id}: ${previousHp} -> ${newHp}`);

    // Track damage for shared loot system
    trackDamage(enemy.id, amount).catch(error => {
        console.warn(`[ENEMY_DAMAGE] Failed to track damage for enemy ${enemy.id}:`, error);
    });

    // Trigger death if HP reaches 0
    if (newHp <= 0) {
        console.log(`[ENEMY_DAMAGE] Enemy ${enemy.id} died from damage`);
        triggerEnemyDeath(enemy);
        enemy.damageInProgress = false; // Allow further damage attempts if needed (though enemy is dead)
        return;
    }

    // Send damage to server for authority
    const currentArea = 'beach';
    const enemyRef = ref(database, `areas/${currentArea}/enemies/${enemy.id}`);

    runTransaction(enemyRef, (serverEnemy) => {
        if (!serverEnemy) {
            console.log(`[ENEMY_DAMAGE] Enemy ${enemy.id} doesn't exist on server during transaction.`);
            return; // Enemy doesn't exist on server
        }
        
        if (serverEnemy.hp <= 0 || serverEnemy.isDead === true) {
            console.log(`[ENEMY_DAMAGE] Server enemy ${enemy.id} already dead, aborting transaction.`);
            return; // Already dead on server, abort transaction
        }

        const serverHp = Number.isFinite(serverEnemy.hp) ? serverEnemy.hp : enemy.maxHp; // Use maxHp as fallback for server if invalid
        serverEnemy.hp = Math.max(0, serverHp - amount);
        serverEnemy.lastUpdate = Date.now();
        
        // If server HP drops to 0, mark as dead on server
        if (serverEnemy.hp <= 0) {
            serverEnemy.isDead = true;
            serverEnemy.despawnTime = Date.now() + DEATH_FADE_DURATION; // Server will remove after client fades
            console.log(`[ENEMY_DAMAGE] Server enemy ${enemy.id} marked as dead. Despawn scheduled.`);
        }

        console.log(`[ENEMY_DAMAGE] Server transaction for ${enemy.id}: ${serverHp} -> ${serverEnemy.hp}`);

        return serverEnemy;
    }).then((result) => {
        enemy.damageInProgress = false;

        if (result.committed) {
            console.log(`[ENEMY_DAMAGE] Server confirmed damage to enemy ${enemy.id}. New HP: ${result.snapshot.val().hp}.`);
            // If the server confirms death, ensure local state is consistent
            if (result.snapshot.val().hp <= 0 || result.snapshot.val().isDead) {
                triggerEnemyDeath(enemy);
            }
        } else {
            console.log(`[ENEMY_DAMAGE] Server rejected damage transaction for enemy ${enemy.id}. Current local HP: ${enemy.hp}.`);
            // If transaction fails (e.g., concurrent update), re-sync local health from server next update cycle.
        }
    }).catch(error => {
        console.warn(`[ENEMY_DAMAGE] Damage transaction failed for enemy ${enemy.id}:`, error);
        enemy.damageInProgress = false;
    });
}

/**
 * Cleans up the enemy system completely.
 * Should be called when leaving game area or shutting down.
 */
export function cleanupEnemies() {
    console.log('Cleaning up enemy system');
    
    // Unsubscribe from Firebase updates
    if (enemyUnsubscribe) {
        enemyUnsubscribe();
        enemyUnsubscribe = null;
    }
    
    // Clear all enemy data
    enemies.clear();
    targetedEnemy = null;
    
    console.log('Enemy system cleanup complete');
}