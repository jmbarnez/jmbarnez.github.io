// Physics simulation for ultra-realistic drone combat
// Handles rigid body dynamics, thrust, drag, and realistic projectile physics

import { game } from './core.js';
import { isInWater } from './world.js';
import { createProjectile } from './projectiles.js';
import { getTime } from '../utils/math.js';
import { GRAVITY as WORLD_GRAVITY } from '../utils/constants.js';

/**
 * Physics constants for realistic simulation
 */
export const PHYSICS_CONSTANTS = {
  // Drone physics - 10x faster!
  DRONE_MASS: 1.8, // kg (increase mass to soften responsiveness)
  MAX_THRUST_POWER: 9000, // Newtons (10x thrust for 10x speed)
  DRAG_COEFFICIENT: 0.2, // Very low drag for high speeds
  ANGULAR_DRAG_COEFFICIENT: 0.1, // Very low drag for sustained turns
  ANGULAR_INERTIA: 0.05, // kg*m² (very responsive!)
  MAX_ANGULAR_VELOCITY: 8.0, // rad/s (reduced for smoother turning)
  THRUST_RESPONSE_TIME: 0.08, // seconds (slower throttle response for softer feel)

  // Projectile physics
  PROJECTILE_MASS: 0.01, // kg (for 7.62mm bullet)
  MUZZLE_VELOCITY: 8000, // m/s (10x faster to match drone speed)
  PROJECTILE_DRAG_COEFFICIENT: 0.3,
  GRAVITY: 9.81, // m/s²
  RECOIL_IMPULSE: 0.5, // Ns

  // Environmental
  AIR_DENSITY: 1.225, // kg/m³
  GROUND_EFFECT_HEIGHT: 5, // pixels
  GROUND_EFFECT_MULTIPLIER: 1.2,

  // Weapon system
  WEAPON_HEAT_CAPACITY: 100,
  WEAPON_HEAT_PER_SHOT: 5,
  WEAPON_COOLING_RATE: 2, // per second
  WEAPON_OVERHEAT_THRESHOLD: 80,
  RECOIL_RECOVERY_TIME: 0.2, // seconds
};

/**
 * Initialize physics properties for a drone entity (simplified)
 */
export function initializeDronePhysics(entity) {
  entity.physics = {
    mass: PHYSICS_CONSTANTS.DRONE_MASS,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    orientation: entity.angle || 0,
    throttle: 0, // 0-1
    targetThrottle: 0,
    torque: 0, // rotational input
    thrustVector: { x: 0, y: 0 },

    // Strafe system
    strafeForce: 1000, // Sideways thrust force (10x for 10x speed)
    // Inertia settings (0..1) - higher values = more inertia (slower velocity response)
    inertia: 0.92,
    verticalInertia: 0.94,
    boostMultiplier: 2.5, // How much thrust increases when boosting

    // Simple systems (always at 100% for now)
    battery: 100,
    weaponHeat: 0,
    isOverheated: false,

    // Combat state
    recoilTimer: 0,
    lastFireTime: 0
  };

  return entity;
}

/**
 * Update drone physics based on input and environmental factors
 */
export function updateDrone(entity, input, dt) {
  if (!entity.physics) {
    initializeDronePhysics(entity);
  }

  const phys = entity.physics;

  // Boost handling (disabled visual/zip per user request but respect input without multiplier)
  phys.boostActive = !!input.boost;
  phys.boostEnabled = false; // disable zippy multiplier by default

  // Update energy systems
  updateEnergySystems(phys, input, dt);

  // Update throttle with smooth response
  updateThrottle(phys, input, dt);

  // Update strafe forces based on strafe input
  applyStrafeForces(phys, input, dt);

  // Calculate forces
  const forces = calculateForces(phys, entity, dt);

  // Integrate physics
  integrateDronePhysics(entity, forces, dt);

  // Apply environmental effects
  applyEnvironmentalEffects(entity, dt);

  // Update orientation and handle rotation
  updateOrientation(entity, input, dt);

  // Handle recoil recovery
  if (phys.recoilTimer > 0) {
    phys.recoilTimer = Math.max(0, phys.recoilTimer - dt);
  }
}

/**
 * Update energy and heat systems (simplified for now)
 */
function updateEnergySystems(phys, input, dt) {
  // Keep battery full for now - no complex energy management
  phys.battery = 100;
  phys.weaponHeat = 0;
  phys.isOverheated = false;
}

/**
 * Update throttle with smooth response
 */
function updateThrottle(phys, input, dt) {
  // Calculate target throttle from input
  let targetThrottle = 0;
  if (input.forward) targetThrottle += 1;
  if (input.backward) targetThrottle -= 0.5; // Reverse thrust is weaker

  // Smooth throttle response
  const throttleDiff = targetThrottle - phys.throttle;
  const maxChange = dt / PHYSICS_CONSTANTS.THRUST_RESPONSE_TIME;
  phys.throttle += Math.max(-maxChange, Math.min(maxChange, throttleDiff));
}

/**
 * Apply strafe forces for sideways movement
 */
function applyStrafeForces(phys, input, dt) {
  const strafeForce = phys.strafeForce || 1000; // Sideways thrust force (10x for 10x speed)

  // Apply lateral thrust relative to current orientation (strafe left/right)
  // Convert strafe into world-space force perpendicular to orientation
  if (input.strafeLeft) {
    // left is -90 degrees from orientation
    const dir = phys.orientation - Math.PI / 2;
    phys.velocity.x += Math.cos(dir) * strafeForce * dt / phys.mass;
    phys.velocity.y += Math.sin(dir) * strafeForce * dt / phys.mass;
  }
  if (input.strafeRight) {
    const dir = phys.orientation + Math.PI / 2;
    phys.velocity.x += Math.cos(dir) * strafeForce * dt / phys.mass;
    phys.velocity.y += Math.sin(dir) * strafeForce * dt / phys.mass;
  }
}

/**
 * Calculate all forces acting on the drone
 */
function calculateForces(phys, entity, dt) {
  const forces = { x: 0, y: 0 };
  const velocity = phys.velocity;
  const speed = Math.hypot(velocity.x, velocity.y);
  // Thrust force (forward/backward)
  let thrustMagnitude = phys.throttle * PHYSICS_CONSTANTS.MAX_THRUST_POWER;
  // Remove boost zippy multiplier when user disables zippy mode
  if (phys.boostActive && phys.boostEnabled !== false) thrustMagnitude *= (phys.boostMultiplier || 1);
  const thrustAngle = phys.orientation;

  forces.x += Math.cos(thrustAngle) * thrustMagnitude;
  forces.y += Math.sin(thrustAngle) * thrustMagnitude;

  // Aerodynamic drag
  if (speed > 0.1) {
    const dragMagnitude = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY *
                         PHYSICS_CONSTANTS.DRAG_COEFFICIENT *
                         speed * speed;
    const dragDirection = Math.atan2(-velocity.y, -velocity.x);
    forces.x += Math.cos(dragDirection) * dragMagnitude;
    forces.y += Math.sin(dragDirection) * dragMagnitude;
  }

  // Ground effect (increased lift near ground)
  const groundEffect = calculateGroundEffect(entity);
  forces.x *= groundEffect;
  forces.y *= groundEffect;

  // Low gravity effect for drones: apply a small downward force so they feel floaty
  // Use a fraction of the world gravity to keep it subtle.
  try {
    const gravityFactor = 0.25; // 25% of world gravity for light hover
    forces.y += phys.mass * WORLD_GRAVITY * gravityFactor;
  } catch (e) {
    // ignore if phys or WORLD_GRAVITY not available
  }

  return forces;
}

/**
 * Calculate ground effect multiplier
 */
function calculateGroundEffect(entity) {
  // Simplified ground effect - stronger lift when close to ground
  const distanceToGround = entity.y; // Simplified - assumes ground at y=0
  if (distanceToGround < PHYSICS_CONSTANTS.GROUND_EFFECT_HEIGHT) {
    const effect = 1 + (PHYSICS_CONSTANTS.GROUND_EFFECT_MULTIPLIER - 1) *
                   (1 - distanceToGround / PHYSICS_CONSTANTS.GROUND_EFFECT_HEIGHT);
    return effect;
  }
  return 1;
}

/**
 * Integrate physics equations
 */
function integrateDronePhysics(entity, forces, dt) {
  const phys = entity.physics;
  const acceleration = {
    x: forces.x / phys.mass,
    y: forces.y / phys.mass
  };

  // Convert to per-frame delta velocity
  const dvx = acceleration.x * dt;
  const dvy = acceleration.y * dt;

  // Inertia blending: velocity responds slowly to acceleration for a floaty feel.
  const inertia = Math.max(0, Math.min(0.99, phys.inertia !== undefined ? phys.inertia : 0.92));
  const vertInertia = Math.max(0, Math.min(0.99, phys.verticalInertia !== undefined ? phys.verticalInertia : 0.94));

  phys.velocity.x = phys.velocity.x * inertia + dvx * (1 - inertia);
  phys.velocity.y = phys.velocity.y * vertInertia + dvy * (1 - vertInertia);

  // Light damping so momentum decays slowly (keeps the inertia feel)
  const damping = 0.995;
  phys.velocity.x *= damping;
  phys.velocity.y *= damping;

  // Integrate position
  entity.x += phys.velocity.x * dt;
  entity.y += phys.velocity.y * dt;
}

/**
 * Apply environmental effects (simplified)
 */
function applyEnvironmentalEffects(entity, dt) {
  const phys = entity.physics;

  // Simple water drag effect
  if (isInWater(entity.x, entity.y)) {
    phys.velocity.x *= 0.95; // Additional drag in water
    phys.velocity.y *= 0.95;
  }
}

/**
 * Update drone orientation and rotation (disabled for mouse-based instant turning)
 */
function updateOrientation(entity, input, dt) {
  const phys = entity.physics;

  // Since we're using instant mouse turning, we don't need physics rotation
  // The mouse input handler already sets entity.angle directly
  // Just ensure physics orientation stays in sync
  phys.orientation = entity.angle;
  phys.angularVelocity = 0; // No physics rotation
}

/**
 * Fire weapon with basic ballistics (simplified)
 */
export function fireWeapon(entity) {
  const phys = entity.physics;
  const now = getTime();

  // Simple rate of fire check
  if (now - phys.lastFireTime < 0.1) { // 10 shots per second max
    return false;
  }

  // Calculate muzzle position and direction
  const muzzleOffset = 8; // Distance from center to muzzle
  const muzzleX = entity.x + Math.cos(entity.angle) * muzzleOffset;
  const muzzleY = entity.y + Math.sin(entity.angle) * muzzleOffset;

  // Calculate muzzle velocity vector
  const muzzleVelocity = PHYSICS_CONSTANTS.MUZZLE_VELOCITY;
  const velocity = {
    x: Math.cos(entity.angle) * muzzleVelocity,
    y: Math.sin(entity.angle) * muzzleVelocity
  };

  // Apply simple recoil
  const recoilImpulse = PHYSICS_CONSTANTS.RECOIL_IMPULSE;
  phys.velocity.x -= Math.cos(entity.angle) * recoilImpulse / phys.mass;
  phys.velocity.y -= Math.sin(entity.angle) * recoilImpulse / phys.mass;

  // Create simple projectile
  createProjectile({
    x: muzzleX,
    y: muzzleY,
    vx: velocity.x,
    vy: velocity.y,
    mass: PHYSICS_CONSTANTS.PROJECTILE_MASS,
    dragCoefficient: PHYSICS_CONSTANTS.PROJECTILE_DRAG_COEFFICIENT,
    damage: 10,
    type: 'ballistic'
  });

  // Update fire timing
  phys.lastFireTime = now;

  return true;
}

/**
 * Update all ballistic projectiles
 */
export function updateBallisticProjectiles(dt) {
  if (!game.projectiles) return;

  game.projectiles.forEach((projectile, index) => {
    if (!projectile || projectile.type !== 'ballistic') return;

    // Apply gravity
    projectile.vy += PHYSICS_CONSTANTS.GRAVITY * dt;

    // Apply drag
    const speed = Math.hypot(projectile.vx, projectile.vy);
    if (speed > 0.1) {
      const dragMagnitude = 0.5 * PHYSICS_CONSTANTS.AIR_DENSITY *
                           projectile.dragCoefficient * speed * speed;
      const dragDirection = Math.atan2(-projectile.vy, -projectile.vx);
      projectile.vx += Math.cos(dragDirection) * dragMagnitude * dt / projectile.mass;
      projectile.vy += Math.sin(dragDirection) * dragMagnitude * dt / projectile.mass;
    }

    // Update position
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    // Check for collisions and out of bounds
    if (checkProjectileCollisions(projectile) ||
        projectile.x < 0 || projectile.x > game.WORLD_WIDTH ||
        projectile.y < 0 || projectile.y > game.WORLD_HEIGHT) {
      game.projectiles.splice(index, 1);
    }
  });
}

/**
 * Check for projectile collisions with enemies
 */
function checkProjectileCollisions(projectile) {
  if (!game.enemies) return false;

  for (let i = 0; i < game.enemies.length; i++) {
    const enemy = game.enemies[i];
    if (!enemy) continue;

    // Simple bounding box collision
    const projectileSize = 2;
    const enemySize = 8;

    if (Math.abs(projectile.x - enemy.x) < projectileSize + enemySize &&
        Math.abs(projectile.y - enemy.y) < projectileSize + enemySize) {

      // Apply damage
      if (enemy.hp) {
        enemy.hp = Math.max(0, enemy.hp - projectile.damage);
      }

      return true; // Projectile hit something
    }
  }

  return false;
}

/**
 * Get current physics debug info (simplified)
 */
export function getPhysicsDebugInfo(entity) {
  if (!entity.physics) return {};

  const phys = entity.physics;
  return {
    velocity: Math.hypot(phys.velocity.x, phys.velocity.y).toFixed(2),
    speed: `${phys.velocity.x.toFixed(1)}, ${phys.velocity.y.toFixed(1)}`,
    throttle: (phys.throttle * 100).toFixed(0) + '%',
    battery: '100%',
    weaponHeat: '0/100',
    isOverheated: false,
    orientation: (phys.orientation * 180 / Math.PI).toFixed(1) + '°',
    angularVelocity: phys.angularVelocity.toFixed(2) + ' rad/s'
  };
}
