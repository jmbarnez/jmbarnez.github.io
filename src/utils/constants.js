// Consolidated constants (movement + audio + app-level) into a single file.
// Only exports values that are referenced across the codebase.

// === Movement / Gameplay Constants ===
export const ACCELERATION = 400000; // pixels/second^2 (10x faster)
export const DECELERATION = 900000; // pixels/second^2 (10x faster)
export const GRAVITY = 40; // pixels/second^2 - low gravity for drone hover feel
export const DAMPING_FACTOR = 0.94; // drag multiplier
export const MAX_SPEED = 80000; // pixels/second (10x faster)

export const DEAD_ZONE = 3; // pixels
export const DECEL_ZONE = 20; // pixels
export const INTERACTION_RADIUS = 100; // pixels - precise interaction range (increased for faster movement)
export const ATTACK_RANGE = 200; // pixels (increased for faster movement)
export const MUZZLE_OFFSET = 12; // pixels
export const DRONE_HEIGHT_OFFSET = 12; // pixels

export const POSITION_UPDATE_RATE = 33; // legacy
export const INTERPOLATION_DURATION = 900; // ms
export const HEARTBEAT_INTERVAL = 5000; // ms

export const STALE_DATA_THRESHOLD = 30000; // ms
export const RECENT_ACTIVITY_THRESHOLD = 30000; // ms
export const BASE_STALE_THRESHOLD = 120000; // ms
export const MAX_STALE_THRESHOLD = 600000; // ms
export const LONG_SESSION_THRESHOLD = 300000; // ms

export const FIRE_COOLDOWN = 1.5; // seconds
export const AUTO_ATTACK_DURATION = 2.0; // seconds

export const PROJECTILE_SPEED = 2000; // pixels/second (10x faster to match movement speed)
export const PROJECTILE_LIFETIME = 2.0; // seconds

export const ENEMY_HP = 3; // fallback standard enemy HP
export const DAMAGE_PER_HIT = 1;

export const IMPACT_EXPLOSION_DURATION = 0.3; // seconds
export const IMPACT_EXPLOSION_SIZE = 8; // pixels

export const INTERPOLATION_EASE_POWER = 2;
export const MAX_INTERPOLATION_TIME = 1000; // ms
export const RUBBER_BAND_THRESHOLD = 5000; // ms

// === Audio (global volume state) ===
let currentVolume = 0.5;
const volumeChangeListeners = [];

try {
  const savedVolume = localStorage.getItem('globalVolume');
  if (savedVolume !== null) currentVolume = parseFloat(savedVolume);
} catch (e) {
  // ignore
}

export function getGlobalVolume() {
  return currentVolume;
}

export function setGlobalVolume(volume) {
  currentVolume = Math.max(0, Math.min(1, volume));
  try { localStorage.setItem('globalVolume', String(currentVolume)); } catch (_) {}
  volumeChangeListeners.forEach(l => l(currentVolume));
}

export function onVolumeChange(cb) {
  if (typeof cb === 'function') volumeChangeListeners.push(cb);
}

// === Loot System Constants ===
export const DEFAULT_LOOT_CHANCE = 0.3; // 30% base chance for item drops
export const RARE_LOOT_CHANCE = 0.1; // 10% chance for rare items
export const EPIC_LOOT_CHANCE = 0.05; // 5% chance for epic items
export const MIN_ITEM_DROP_COUNT = 1;
export const MAX_ITEM_DROP_COUNT = 3;


// === Small app-level constants ===
export const INVENTORY_SIZE = 24;
export const HEALTH_CHECK_URL = import.meta.env?.VITE_HEALTH_CHECK_URL || "https://YOUR_PROJECT_ID.cloudfunctions.net/healthDb";