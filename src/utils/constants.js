// Consolidated constants (movement + audio + app-level) into a single file.
// Only exports values that are referenced across the codebase.

// === Movement / Gameplay Constants ===
export const ACCELERATION = 800; // pixels/second^2
export const DECELERATION = 1800; // pixels/second^2
export const GRAVITY = 0; // pixels/second^2
export const DAMPING_FACTOR = 0.94; // drag multiplier
export const MAX_SPEED = 160; // pixels/second

export const DEAD_ZONE = 3; // pixels
export const DECEL_ZONE = 20; // pixels
export const INTERACTION_RADIUS = 30; // pixels
export const ATTACK_RANGE = 55; // pixels
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

export const PROJECTILE_SPEED = 200; // pixels/second
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

// === Small app-level constants ===
export const INVENTORY_SIZE = 24;
export const HEALTH_CHECK_URL = import.meta.env?.VITE_HEALTH_CHECK_URL || "https://YOUR_PROJECT_ID.cloudfunctions.net/healthDb";