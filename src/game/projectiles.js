import { game } from './core.js';
import { getEnemies, damageEnemy } from './enemies.js';
import { playEnemyHitSound } from '../utils/sfx.js';
import { subscribeToProjectiles, createProjectile as createServerProjectile } from '../services/projectileService.js';
import { PROJECTILE_SPEED, PROJECTILE_LIFETIME, DAMAGE_PER_HIT, IMPACT_EXPLOSION_DURATION, IMPACT_EXPLOSION_SIZE } from '../utils/constants.js';

// AI: Local projectile storage for immediate visual feedback and server-synced projectiles
const projectiles = [];
// AI: Impact explosion effects storage for visual feedback on hits
const impactExplosions = [];
const PROJECTILE_SIZE = 0.5; // Much smaller bullet size for realistic appearance
const PROJECTILE_COLOR = '#FF4444'; // Red color for better visibility

// AI: Track initialization state to prevent duplicate subscriptions
let isInitialized = false;

/**
 * AI: Creates a guaranteed-hit projectile like League of Legends auto-attacks.
 * Projectiles always hit their target when they reach attack range, with proper visual effects.
 * @param {number} startX - The starting x-coordinate.
 * @param {number} startY - The starting y-coordinate.
 * @param {object} target - The target enemy object { x, y, id }.
 */
export function createProjectile(startX, startY, target) {
    const dx = target.x - startX;
    const dy = target.y - startY;
    const dist = Math.hypot(dx, dy);

    // AI: Ensure we have a valid direction vector to prevent NaN velocities
    if (dist < 0.001) {
        console.warn('Target too close to projectile origin, skipping creation');
        return;
    }

    // AI: Calculate exact travel time to target for guaranteed hit timing
    const travelTime = dist / PROJECTILE_SPEED;

    const projectileData = {
        x: startX,
        y: startY,
        vx: (dx / dist) * PROJECTILE_SPEED,
        vy: (dy / dist) * PROJECTILE_SPEED,
        size: PROJECTILE_SIZE,
        color: PROJECTILE_COLOR,
        life: PROJECTILE_LIFETIME, // Use shared constant for consistency
        targetId: target.id, // Track which enemy was targeted for guaranteed hit
        targetX: target.x, // Store target position for guaranteed hit
        targetY: target.y - 6, // Adjust for enemy visual center
        travelTime: travelTime, // Time to reach target for guaranteed hit
        timeAlive: 0, // Track how long projectile has existed
        isLocal: true, // All projectiles are local for visual consistency
        playerId: game.player?.uid || 'local', // Track who fired
        timestamp: Date.now()
    };
    
    
    // AI: Add projectile for immediate visual feedback
    projectiles.push(projectileData);

    // AI: Send to server for multiplayer sync (visual only for other clients)
    try {
        createServerProjectile('beach', {
            ...projectileData,
            isLocal: false // Mark server projectiles as visual-only
        });
    } catch (e) {
        console.warn('Failed to create server projectile:', e);
    }
}

/**
 * AI: Initialize projectile system with proper subscription management.
 * Sets up server projectile synchronization and prevents duplicate subscriptions.
 */
export function initProjectiles() {
    // AI: Prevent duplicate initialization that could cause memory leaks
    if (isInitialized) {
        console.warn('Projectile system already initialized, skipping');
        return;
    }
    
    console.log('Initializing projectile system...');
    
    // AI: Subscribe to server projectiles for multiplayer synchronization
    // Server projectiles are authoritative and should be displayed by all clients
    subscribeToProjectiles('beach', (projectileData) => {
        // AI: Validate server projectile data before adding to local array
        if (!projectileData || typeof projectileData.x !== 'number' || typeof projectileData.y !== 'number') {
            console.warn('Invalid server projectile data received:', projectileData);
            return;
        }
        
        // AI: Add server projectile with proper initialization for guaranteed hit system
        const serverProjectile = {
            ...projectileData,
            isServer: true, // Flag to distinguish from local projectiles
            isLocal: false, // Server projectiles are visual only
            life: projectileData.life || PROJECTILE_LIFETIME, // Ensure consistent lifetime
            timeAlive: 0, // Initialize time tracking
            hasHit: false // Initialize hit state
        };
        
        projectiles.push(serverProjectile);
        console.debug('Added server projectile:', serverProjectile);
    });
    
    isInitialized = true;
    console.log('Projectile system initialized successfully');
}

/**
 * AI: Updates all projectiles with guaranteed-hit logic like League of Legends.
 * Projectiles always hit their target when travel time is reached, regardless of position.
 * @param {number} dt - Delta time in seconds.
 */
export function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        
        // AI: Update projectile position and lifetime
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.timeAlive += dt;

        // AI: Remove expired projectiles
        if (p.life <= 0) {
            projectiles.splice(i, 1);
            continue;
        }

        // AI: Guaranteed hit system - check if travel time reached target
        if (!p.hasHit && p.timeAlive >= p.travelTime) {
            // AI: Mark as hit to prevent multiple triggers
            p.hasHit = true;
            
            // AI: Find target enemy for guaranteed hit effects
            const targetEnemy = getEnemies().find(enemy => enemy.id === p.targetId);
            
            if (targetEnemy && targetEnemy.hp > 0 && !targetEnemy.isDead) {
                // AI: Create impact explosion at target's current position (not stored position)
                const explosionY = targetEnemy.y - 6; // Adjust for enemy visual center
                createImpactExplosion(targetEnemy.x, explosionY);

                // AI: Apply damage for local projectiles (shooter's projectiles)
                if (p.isLocal) {
                    damageEnemy(targetEnemy, DAMAGE_PER_HIT);
                    playEnemyHitSound();
                }
            } else {
                // AI: Target no longer exists - create explosion at stored target position
                createImpactExplosion(p.targetX, p.targetY);
            }
            
            // AI: Remove projectile after guaranteed hit
            projectiles.splice(i, 1);
            continue;
        }

        // AI: Alternative removal for projectiles that travel too far (safety net)
        const maxDistance = Math.max(game.WORLD_WIDTH, game.WORLD_HEIGHT) * 2;
        if (Math.hypot(p.x, p.y) > maxDistance) {
            projectiles.splice(i, 1);
            continue;
        }
    }
    
    // AI: Update impact explosion animations
    updateImpactExplosions(dt);
}

/**
 * AI: Creates an impact explosion effect at the specified location.
 * Used when projectiles hit enemies for visual feedback.
 * @param {number} x - X coordinate of impact
 * @param {number} y - Y coordinate of impact
 */
function createImpactExplosion(x, y) {
    impactExplosions.push({
        x: x,
        y: y,
        life: IMPACT_EXPLOSION_DURATION,
        maxLife: IMPACT_EXPLOSION_DURATION,
        size: 0 // Start small and expand
    });
}

/**
 * AI: Updates impact explosion animations.
 * Called every frame to animate explosion effects.
 * @param {number} dt - Delta time in seconds
 */
function updateImpactExplosions(dt) {
    for (let i = impactExplosions.length - 1; i >= 0; i--) {
        const explosion = impactExplosions[i];
        explosion.life -= dt;
        
        // AI: Animate size based on remaining life (expand then contract)
        const progress = 1 - (explosion.life / explosion.maxLife);
        if (progress < 0.5) {
            // AI: Expand phase - first half of animation
            explosion.size = (progress * 2) * IMPACT_EXPLOSION_SIZE;
        } else {
            // AI: Contract phase - second half of animation
            explosion.size = (2 - progress * 2) * IMPACT_EXPLOSION_SIZE;
        }
        
        // AI: Remove expired explosions
        if (explosion.life <= 0) {
            impactExplosions.splice(i, 1);
        }
    }
}

/**
 * AI: Draws all projectiles and impact explosions.
 * Handles both active projectiles and visual effects.
 */
export function drawProjectiles() {
    const { ctx } = game;
    if (!ctx) return;

    // AI: Draw active projectiles as tiny energy beams
    for (const p of projectiles) {
        // AI: Calculate beam direction and length based on velocity
        const beamLength = 6; // Length of the beam
        const angle = Math.atan2(p.vy, p.vx);
        const backX = p.x - Math.cos(angle) * beamLength;
        const backY = p.y - Math.sin(angle) * beamLength;
        
        // AI: Draw main beam line
        ctx.beginPath();
        ctx.moveTo(backX, backY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // AI: Add glow effect for better visibility
        ctx.beginPath();
        ctx.moveTo(backX, backY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `${p.color}60`; // Semi-transparent glow
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // AI: Draw impact explosion effects
    for (const explosion of impactExplosions) {
        const alpha = explosion.life / explosion.maxLife; // Fade out over time
        
        // AI: Outer explosion ring
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.size, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 165, 0, ${alpha * 0.8})`; // Orange with fade
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // AI: Inner explosion core
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha * 0.6})`; // Yellow core with fade
        ctx.fill();
    }
}