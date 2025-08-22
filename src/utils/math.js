// Math utility functions
// AI: Safe performance.now() wrapper with fallback to Date.now()
import { isInWater } from '../game/world.js';
export function getTime() {
  return (typeof window !== 'undefined' && window.performance && window.performance.now) ? window.performance.now() : Date.now();
}

export function randi(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

/**
 * Calculates the total experience required to reach a specific level.
 * This formula ensures that leveling up becomes progressively harder.
 * The formula is: Experience = floor(base * (level ^ exponent))
 * @param {number} level - The level to calculate the experience for.
 * @returns {number} The total experience required for the given level.
 */
export function getExpForLevel(level) {
  const baseExperience = 100; // Experience needed for level 2
  const exponent = 1.5; // Controls how much harder each level gets
  if (level <= 1) return 0;
  return Math.floor(baseExperience * Math.pow(level - 1, exponent));
}

/**
 * Calculates the level based on the total experience points.
 * This is the inverse of the getExpForLevel function.
 * The formula is: Level = floor((Experience / base) ^ (1 / exponent)) + 1
 * @param {number} experience - The total experience points.
 * @returns {number} The calculated level.
 */
export function getLevelFromExperience(experience) {
  const baseExperience = 100;
  const exponent = 1.5;
  if (experience <= 0) return 1;
  const level = Math.floor(Math.pow(experience / baseExperience, 1 / exponent)) + 1;
  return level;
}

/**
 * Get experience required for specific level
 * @param {number} level - The level to get experience for.
 * @returns {number} The experience required for the given level.
 */
export function getExpRequiredForLevel(level) {
  return getExpForLevel(level);
}

/**
 * Snaps a value to the nearest integer for crisp pixel art rendering
 * @param {number} value - The value to snap
 * @returns {number} The snapped integer value
 */
export function snapToPixel(value) {
  return Math.round(value);
}

/**
 * Snaps coordinates to integers for crisp pixel art rendering
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {object} Object with snapped x and y coordinates
 */
export function snapCoordsToPixel(x, y) {
  return {
    x: snapToPixel(x),
    y: snapToPixel(y)
  };
}

/**
 * Calculate depth value for entity sorting (lower = more in front)
 * @param {number} x - Entity X position
 * @param {number} y - Entity Y position
 * @param {number} height - Entity height
 * @param {number} depthBias - Additional depth bias (optional)
 * @returns {number} Depth value for sorting
 */
export function calculateEntityDepth(x, y, height = 0, depthBias = 0.1) {
  // Primary sorting by Y position + height (higher Y = more behind)
  // Secondary sorting by X position with slight bias (creates natural depth)
  return (y + height) + (x * depthBias);
}

export function weightedPick(list) {
  const total = list.reduce((s, it) => s + (it.weight || 1), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of list) {
    if ((r -= (it.weight || 1)) <= 0) return it;
  }
  return list[list.length - 1];
}

/**
 * Clamps world coordinates to game boundaries and nudges them out of water if necessary.
 * @param {number} x - The x-coordinate to clamp.
 * @param {number} y - The y-coordinate to clamp.
 * @param {object} game - The game object containing WORLD_WIDTH, WORLD_HEIGHT, and isInWater function.
 * @param {number} padding - Optional padding from world edges.
 * @returns {{x: number, y: number}} The clamped coordinates.
 */
export function clampWorldCoordinates(x, y, game, padding = 12) {
  let cx = Math.max(padding, Math.min(game.WORLD_WIDTH - padding, x));
  let cy = Math.max(padding, Math.min(game.WORLD_HEIGHT - padding, y));

  // If in water, nudge towards center (assuming water is usually at edges or specific regions)
  if (isInWater(cx, cy)) {
    // This is a simple heuristic; more complex terrain might need a proper pathfinding or random safe spot logic.
    cx = game.WORLD_WIDTH * 0.4 + (cx - game.WORLD_WIDTH * 0.4) * 0.5;
    cy = game.WORLD_HEIGHT * 0.4 + (cy - game.WORLD_HEIGHT * 0.4) * 0.5;
  }
  return { x: cx, y: cy };
}

// AI: Converts world coordinates to screen coordinates, accounting for camera position and zoom.
// AI: Snaps to integers for crisp pixel art under discrete zoom levels.
export function worldToScreenCoords(worldX, worldY, camera) {
  const screenX = (worldX - camera.x) * camera.zoom;
  const screenY = (worldY - camera.y) * camera.zoom;
  return snapCoordsToPixel(screenX, screenY);
}

// AI: Converts world coordinates to screen coordinates with sub-pixel precision.
export function worldToScreenCoordsPrecise(worldX, worldY, camera) {
  const screenX = (worldX - camera.x) * camera.zoom;
  const screenY = (worldY - camera.y) * camera.zoom;
  return { x: screenX, y: screenY };
}

// AI: Converts screen coordinates to world coordinates, accounting for camera position and zoom.
export function screenToWorldCoords(screenX, screenY, camera) {
  const worldX = (screenX / camera.zoom) + camera.x;
  const worldY = (screenY / camera.zoom) + camera.y;
  return { x: worldX, y: worldY };
}

/**
 * Checks if a given point (x, y) is within a specified radius of the center of an element.
 * @param {HTMLElement} element - The DOM element to check against.
 * @param {number} x - The x-coordinate of the point.
 * @param {number} y - The y-coordinate of the point.
 * @param {number} [radius=32] - The radius around the element's center to check within.
 * @returns {boolean} True if the point is within the radius, false otherwise.
 */
export function within(element, x, y, radius = 32) {
  if (!element || !element.getBoundingClientRect) return false;
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx - x;
  const dy = cy - y;
  return (dx * dx + dy * dy) <= (radius * radius);
}

/**
 * Formats a Firestore Timestamp or Date-like object into HH:MM (24h) string.
 * @param {import('firebase/firestore').Timestamp|Date|number|string} ts - The timestamp to format.
 * @returns {string} The formatted time string (e.g., "14:35").
 */
export function formatChatTime(ts) {
  try {
    let d;
    if (ts && typeof ts.toDate === 'function') {
      d = ts.toDate();
    } else if (ts instanceof Date) {
      d = ts;
    } else if (typeof ts === 'number' || typeof ts === 'string') {
      d = new Date(ts);
    } else {
      d = new Date();
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (_) {
    return '--:--';
  }
}

/**
 * Coerces a Firestore Timestamp, Date, number, or string into a number representing milliseconds since epoch.
 * Returns 0 if coercion fails.
 * @param {import('firebase/firestore').Timestamp|Date|number|string} ts - The timestamp to coerce.
 * @returns {number} Milliseconds since epoch, or 0 if invalid.
 */
export function coerceTs(ts) {
  try {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts === 'string') {
      const n = Number(ts);
      return Number.isFinite(n) ? n : Date.parse(ts) || 0;
    }
  } catch (_) {}
  return 0;
}