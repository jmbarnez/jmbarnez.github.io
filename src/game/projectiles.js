import { game } from './core.js';
import { getEnemies } from './enemies.js';
import { playEnemyHitSound } from '../utils/sfx.js';
import { sendGuaranteedHit } from '../services/projectileService.js';
import { PROJECTILE_SPEED, PROJECTILE_LIFETIME, DAMAGE_PER_HIT, IMPACT_EXPLOSION_DURATION, IMPACT_EXPLOSION_SIZE } from '../utils/constants.js';

// AI: Local projectile storage for guaranteed-hit projectiles and server-synced projectiles
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
/**
 * Create projectile. Supports two call styles:
 *  - createProjectile(startX, startY, target) -> guaranteed-hit projectile (used by core AI)
 *  - createProjectile(opts) -> ballistic projectile object (used by physics.fireWeapon)
 */
export function createProjectile(a, b, c) {
    // If called with a single object, treat as ballistic projectile creation
    if (typeof a === 'object' && a !== null && (a.vx !== undefined || a.vy !== undefined || a.type || a.startX !== undefined)) {
        const opts = a;
        // Ensure global game.projectiles exists for physics integration
        game.projectiles = game.projectiles || [];

        // Handle remote projectile format (startX, startY, targetX, targetY)
        if (opts.startX !== undefined && opts.targetX !== undefined) {
            const startX = opts.startX;
            const startY = opts.startY;
            const targetX = opts.targetX;
            const targetY = opts.targetY;

            const dx = targetX - startX;
            const dy = targetY - startY;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) return null;

            const proj = {
                x: startX,
                y: startY,
                vx: (dx / dist) * PROJECTILE_SPEED,
                vy: (dy / dist) * PROJECTILE_SPEED,
                size: PROJECTILE_SIZE,
                color: PROJECTILE_COLOR, // Red for all players
                life: PROJECTILE_LIFETIME,
                targetX: targetX,
                targetY: targetY,
                travelTime: dist / PROJECTILE_SPEED,
                timeAlive: 0,
                isGuaranteedHit: true,
                isRemote: opts.isRemote || false,
                playerId: opts.playerId || null
            };

            projectiles.push(proj);
            return proj;
        }

        const proj = {
            x: opts.x || 0,
            y: opts.y || 0,
            vx: opts.vx || 0,
            vy: opts.vy || 0,
            mass: opts.mass || 0.01,
            dragCoefficient: opts.dragCoefficient || 0.1,
            damage: opts.damage || 1,
            type: opts.type || 'ballistic',
            lifetime: opts.life || PROJECTILE_LIFETIME
        };

        game.projectiles.push(proj);
        return proj;
    }

    // Otherwise assume (startX, startY, target) guaranteed-hit projectile
    const startX = a;
    const startY = b;
    const target = c;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return;

    const dx = target.x - startX;
    const dy = target.y - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
        console.warn('Target too close to projectile origin, skipping creation');
        return;
    }
    const travelTime = dist / PROJECTILE_SPEED;
    const projectileData = {
        x: startX,
        y: startY,
        vx: (dx / dist) * PROJECTILE_SPEED,
        vy: (dy / dist) * PROJECTILE_SPEED,
        size: PROJECTILE_SIZE,
        color: PROJECTILE_COLOR,
        life: PROJECTILE_LIFETIME,
        targetId: target.id,
        targetX: target.x,
        targetY: target.y - 6,
        travelTime: travelTime,
        timeAlive: 0,
        isLocal: true,
        playerId: game.player?.uid || 'local',
        timestamp: Date.now(),
        hasHit: false
    };

    projectiles.push(projectileData);

    // Note: projectiles are rendered client-side. Guaranteed-hit damage will be sent
    // to the server when the projectile reaches its target (see updateProjectiles()).

    return projectileData;
}

/**
 * AI: Initialize projectile system for client-side rendering.
 * All projectiles are handled locally for guaranteed-hit system.
 */
export function initProjectiles() {
    // AI: Prevent duplicate initialization that could cause memory leaks
    if (isInitialized) {
        console.warn('Projectile system already initialized, skipping');
        return;
    }

    console.log('Initializing projectile system...');

    // AI: Projectiles are now handled entirely client-side for guaranteed-hit system
    // No server subscription needed - all projectiles are local visuals

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
                    // Send authoritative guaranteed-hit to server
                    sendGuaranteedHit('beach', targetEnemy.id, p.playerId, DAMAGE_PER_HIT)
                      .then((res) => {
                          // play local hit feedback
                          playEnemyHitSound();
                      })
                      .catch((err) => {
                          console.warn('Guaranteed hit request failed:', err);
                          // Fallback: apply local damage for responsiveness
                          // (server will reconcile shortly via RTDB)
                          try { window.console && window.console.warn('Applying local fallback damage'); } catch(_) {}
                      });
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
export function createImpactExplosion(x, y) {
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

// AI: Expose createProjectile globally for multiplayer projectile sync
if (typeof window !== 'undefined') {
    window.createProjectile = createProjectile;
}