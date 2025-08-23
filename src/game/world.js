// AI: This file has been refactored to support a camera with zoom,
// seeded procedural terrain generation, and a fixed world size.

import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { seededNoise, saveTerrainSeed, loadTerrainSeed, generateRandomSeed } from '../utils/noise.js';
import { WORLD_WIDTH, WORLD_HEIGHT, OASIS_CONFIG, BIOMES, PERMANENT_TERRAIN_SEED, CHUNK_PIXEL_SIZE, TILE_PIXEL_SIZE, CHUNK_TILE_SIZE, WORLD_PADDING } from '../utils/worldConstants.js';
// Chunked world generator removed for small fixed world.
// WorldGenerator module retained in repo for reference but not used here.

// Terrain downsample factor used for faster generation and for caching keys.
// Increase to 4 for much faster generation with coarse but acceptable detail.
const TERRAIN_DOWNSAMPLE = 4; // keep in sync with generateTerrain's downsample

// Local lightweight mulberry32 PRNG generator so this module can create
// repeatable grain overlays without relying on an unexported symbol from
// the noise module.
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Get biome for a given noise value and position
function getBiomeAt(noiseValue, x, y) {
  // Calculate distance from oasis center
  const dx = x - OASIS_CONFIG.centerX;
  const dy = y - OASIS_CONFIG.centerY;
  const distanceFromOasis = Math.sqrt(dx * dx + dy * dy);

  // Check if we're in the oasis pond (central water area)
  if (distanceFromOasis <= OASIS_CONFIG.pondRadius) {
    return BIOMES.DEEP_WATER;
  }

  // Check if we're in the oasis vegetation area
  if (distanceFromOasis <= OASIS_CONFIG.radius) {
    // In oasis - bias toward vegetation and water
    if (noiseValue < 0.3) return BIOMES.WATER;
    if (noiseValue < 0.7) return BIOMES.VEGETATION;
    return BIOMES.VEGETATION;
  }

  // Regular terrain - use standard biome thresholds
  if (noiseValue < BIOMES.DEEP_WATER.threshold) return BIOMES.DEEP_WATER;
  if (noiseValue < BIOMES.WATER.threshold) return BIOMES.WATER;
  if (noiseValue < BIOMES.WET_SAND.threshold) return BIOMES.WET_SAND;
  if (noiseValue < BIOMES.DRY_SAND.threshold) return BIOMES.DRY_SAND;
  return BIOMES.VEGETATION;
}

// Generate simple static desert terrain
async function generateTerrain(seed) {
  console.log(`[TERRAIN] Generating simple static desert terrain (seed: ${seed})`);

  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD_WIDTH;
  terrainCanvas.height = WORLD_HEIGHT;
  const ctx = terrainCanvas.getContext('2d');

  // Ensure crisp pixel rendering
  ctx.imageSmoothingEnabled = false;

  // Fill the world canvas with the desert sand color so the playable area
  // is visible immediately. Previously the generator left the canvas
  // transparent which showed as black in the viewport when rendered.
  ctx.fillStyle = (BIOMES && BIOMES.DRY_SAND && BIOMES.DRY_SAND.color) || '#c9b98a';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Create empty water mask (no water in pure desert)
  const waterMask = new Array(WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    waterMask[y] = new Array(WORLD_WIDTH).fill(false);
  }

  // Store terrain data
  game.terrain = game.terrain || {};
  game.terrain.map = terrainCanvas;
  game.terrain.waterMask = waterMask;
  game.terrain.seed = seed;

  console.log(`[TERRAIN] Created simple desert terrain ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
}

// Set the terrain seed and regenerate terrain
export async function setTerrainSeed(seed) {
  console.log(`[TERRAIN] setTerrainSeed called with seed: ${seed} (type: ${typeof seed})`);

  // If no seed provided, use the permanent static seed for consistent terrain
  if (seed === undefined || seed === null) {
    seed = PERMANENT_TERRAIN_SEED;
    console.log(`[TERRAIN] Using permanent static seed: ${seed} (0x${seed.toString(16).toUpperCase()})`);
  }

  // Validate seed is a number
  if (typeof seed !== 'number' || isNaN(seed)) {
    console.error(`[TERRAIN] Invalid seed value: ${seed}, generating new random seed`);
    seed = generateRandomSeed();
  }

  console.log(`[TERRAIN] Final seed value: ${seed}`);

  // Save seed for persistence
  saveTerrainSeed(seed);

  // Update game world dimensions
  game.WORLD_WIDTH = WORLD_WIDTH;
  game.WORLD_HEIGHT = WORLD_HEIGHT;

  // Generate terrain with the seed
  // Generate terrain and signal loading progress to the loading screen
  (async () => {
    try {
      // If a loading screen exists, show and update progress during generation
      if (window.loadingScreen && typeof window.loadingScreen.show === 'function') {
        window.loadingScreen.showAreaLoading('world');
      }
      await generateTerrain(seed);
      // Signal complete
      if (window.loadingScreen && typeof window.loadingScreen.updateProgress === 'function') {
        window.loadingScreen.updateProgress(100);
      }
    } finally {
      // Ensure generating flag is cleared by generateTerrain itself or here
      game.terrain._generating = false;
    }
  })();
}

// Export functions for use by other modules
export { loadTerrainSeed, saveTerrainSeed, generateRandomSeed };

// Global API for setting terrain seed (accessible from console)
window.setTerrainSeed = setTerrainSeed;
window.getCurrentTerrainSeed = loadTerrainSeed;

// AI: The camera object tracks the viewport's position and zoom level.
// AI: Camera system redesigned to not always follow player and provide better zoom control.
export const camera = {
  x: 0,
  y: 0,
  // AI: Target position for smooth camera movement
  targetX: 0,
  targetY: 0,
  // AI: Initialize width and height to 0 to prevent circular dependency error.
  // The correct values are set in the update() function every frame.
  width: 0,
  height: 0,
  zoom: 1, // Current zoom level (interpolated towards targetZoom)
  targetZoom: 1, // Target zoom set by UI (mouse wheel / settings)
  // Allow multiple zoom levels; keep this array small and discrete so wheel
  // scrolling snaps to meaningful steps. Avoid hardcoding elsewhere.
  allowedZooms: [1, 1.5, 2],
  // AI: Camera smoothing factor - lower values make camera movement more gradual
  smoothing: 0.08, // AI: Reduced to eliminate snapping, creates smoother movement
  // AI: Distance threshold - camera only moves when player is this far from center
  followThreshold: 50, // AI: LoL-style dead zone - camera doesn't move until player is this far from center
  // AI: Look-ahead distance - how far ahead camera looks in direction of movement
  lookAheadDistance: 40, // AI: LoL-style look-ahead for more dynamic feel

  // AI: Free camera mode properties
  isFreeCamera: false, // Toggle between free movement and player following
  moveSpeed: 24, // Camera movement speed in pixels per frame (3x faster)
  keysPressed: { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false },
  
  // AI: Updates camera position with strict centering and edge clamping
  update() {
  // Smoothly interpolate zoom toward targetZoom so zoom changes feel natural.
  // We do this first so viewport size calculation below uses the current
  // interpolated zoom for accurate clamping and centering.
  if (this.targetZoom === undefined || this.targetZoom === null) this.targetZoom = this.zoom;
  // Snap targetZoom to nearest allowed level if allowedZooms provided
  if (Array.isArray(this.allowedZooms) && this.allowedZooms.length > 0) {
    // Ensure targetZoom is one of allowed values (wheel handler sets this)
    if (!this.allowedZooms.includes(this.targetZoom)) {
      // Find closest allowed zoom
      let closest = this.allowedZooms[0];
      let minDiff = Math.abs(this.targetZoom - closest);
      for (let i = 1; i < this.allowedZooms.length; i++) {
        const d = Math.abs(this.targetZoom - this.allowedZooms[i]);
        if (d < minDiff) { minDiff = d; closest = this.allowedZooms[i]; }
      }
      this.targetZoom = closest;
    }
  }

  // Interpolate current zoom toward targetZoom (smooth transition)
  const ZOOM_LERP = 0.18; // tuned for snappy but smooth feel
  this.zoom += (this.targetZoom - this.zoom) * ZOOM_LERP;
  // If very close, snap to avoid floating residue
  if (Math.abs(this.zoom - this.targetZoom) < 0.001) this.zoom = this.targetZoom;

  // Compute effective viewport size in world pixels accounting for current zoom.
  // The canvas is scaled by `camera.zoom` during draw (ctx.scale), so the
  // number of world pixels visible equals CSS pixels divided by zoom.
  this.width = Math.max(1, Math.round(game.width / (this.zoom || 1)));
  this.height = Math.max(1, Math.round(game.height / (this.zoom || 1)));

    // Free camera mode: unchanged behavior but with updated clamps
    if (this.isFreeCamera) {
      let moveX = 0;
      let moveY = 0;
      if (this.keysPressed.w || this.keysPressed.up) moveY -= this.moveSpeed;
      if (this.keysPressed.s || this.keysPressed.down) moveY += this.moveSpeed;
      if (this.keysPressed.a || this.keysPressed.left) moveX -= this.moveSpeed;
      if (this.keysPressed.d || this.keysPressed.right) moveX += this.moveSpeed;

      this.x += moveX;
      this.y += moveY;

      // Clamp to world boundaries
      this.x = Math.max(0, Math.min(this.x, Math.max(0, game.WORLD_WIDTH - this.width)));
      this.y = Math.max(0, Math.min(this.y, Math.max(0, game.WORLD_HEIGHT - this.height)));
      return;
    }

    // Follow mode: strictly center the camera on the player, then clamp.
    // This makes the camera remain still when the player moves toward world edges
    // because the clamped camera position can't move further; the player will
    // continue moving to the corner while the viewport stays at the edge.
    const desiredX = Math.round(game.player.x - this.width / 2);
    const desiredY = Math.round(game.player.y - this.height / 2);

    // Clamp desired position so viewport never shows outside the world.
    const maxCamX = Math.max(0, game.WORLD_WIDTH - this.width);
    const maxCamY = Math.max(0, game.WORLD_HEIGHT - this.height);

    this.x = Math.max(0, Math.min(desiredX, maxCamX));
    this.y = Math.max(0, Math.min(desiredY, maxCamY));
    // Keep target in sync for any smoothing toggles or future use
    this.targetX = this.x;
    this.targetY = this.y;
  },

  // AI: Center camera on player (used when space bar is pressed)
  centerOnPlayer() {
    this.isFreeCamera = false; // Return to follow mode
    this.targetX = game.player.x - this.width / 2;
    this.targetY = game.player.y - this.height / 2;
  },

  // AI: Toggle free camera mode
  toggleFreeCamera() {
    this.isFreeCamera = !this.isFreeCamera;
    if (!this.isFreeCamera) {
      // When returning to follow mode, snap to player
      this.centerOnPlayer();
    }
  },
};

// AI: Draws the visible portion of the terrain, applying camera zoom and translation.
export function drawTerrain() {
  const { ctx } = game;
  if (!ctx) {
    console.warn('Canvas context not available in drawTerrain');
    return;
  }

  // Clear viewport in screen pixels
  ctx.clearRect(0, 0, game.width, game.height);

  // Draw the terrain with the same camera transform used for entities so
  // it moves with the viewport. We apply the transform locally inside
  // drawTerrain to avoid changing the existing draw order in core.loop.
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  if (game.terrain && game.terrain.map) {
    try {
      ctx.imageSmoothingEnabled = false;
      // Draw terrain at world origin; transforms above position it correctly
      ctx.drawImage(game.terrain.map, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } catch (e) {
      // Defensive: ignore draw errors
    }
  } else {
    // Fallback: fill sand area using world bounds
    ctx.fillStyle = '#c9b98a'; // Desert sand color
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  // Restore so caller can apply its own transforms for subsequent draws
  ctx.restore();
}

// Check if a position is in water using the terrain water mask
export function isInWater(x, y) {
  // Clamp coordinates to world bounds
  const px = Math.floor(x);
  const py = Math.floor(y);

  // If generator is present, query chunk water mask
  if (game._worldGenerator) {
    const cx = Math.floor(px / CHUNK_PIXEL_SIZE);
    const cy = Math.floor(py / CHUNK_PIXEL_SIZE);
    const chunk = game._worldGenerator.getChunk(cx, cy);
    if (chunk && chunk.waterMask) {
      const localX = px - cx * (CHUNK_PIXEL_SIZE / TILE_PIXEL_SIZE) * TILE_PIXEL_SIZE;
      const localY = py - cy * (CHUNK_PIXEL_SIZE / TILE_PIXEL_SIZE) * TILE_PIXEL_SIZE;
      // Convert to tile coords
      const tileX = Math.floor(localX / TILE_PIXEL_SIZE);
      const tileY = Math.floor(localY / TILE_PIXEL_SIZE);
      if (tileX >= 0 && tileX < CHUNK_TILE_SIZE && tileY >= 0 && tileY < CHUNK_TILE_SIZE) {
        const idx = tileY * CHUNK_TILE_SIZE + tileX;
        return !!chunk.waterMask[idx];
      }
    }
  }

  // Fallback to old world-wide mask if present
  const clampedX = Math.max(0, Math.min(WORLD_WIDTH - 1, px));
  const clampedY = Math.max(0, Math.min(WORLD_HEIGHT - 1, py));
  if (game.terrain && game.terrain.waterMask && game.terrain.waterMask[clampedY]) {
    return game.terrain.waterMask[clampedY][clampedX];
  }

  return false;
}

// Export the constants for other modules to use
export { WORLD_WIDTH, WORLD_HEIGHT };
