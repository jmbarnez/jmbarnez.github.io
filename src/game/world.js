// AI: This file has been refactored to support a camera with zoom,
// seeded procedural terrain generation, and a fixed world size.

import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { seededNoise, saveTerrainSeed, loadTerrainSeed, generateRandomSeed } from '../utils/noise.js';
import { WORLD_WIDTH, WORLD_HEIGHT, OASIS_CONFIG, BIOMES, PERMANENT_TERRAIN_SEED, CHUNK_PIXEL_SIZE, TILE_PIXEL_SIZE, CHUNK_TILE_SIZE } from '../utils/worldConstants.js';
import WorldGenerator from './worldGenerator.js';

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

  // Fill entire world with desert sand color
  try {
    const desertColor = BIOMES.DRY_SAND.color || '#c9b98a';
    ctx.fillStyle = desertColor;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  } catch (e) {
    console.warn('Failed to fill desert terrain color:', e);
  }

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
  zoom: 1, // Current zoom level locked to 1x
  targetZoom: 1, // Target zoom locked to 1x
  // Locked to 1x zoom only
  allowedZooms: [1],
  // AI: Camera smoothing factor - lower values make camera movement more gradual
  smoothing: 0.08, // AI: Reduced to eliminate snapping, creates smoother movement
  // AI: Distance threshold - camera only moves when player is this far from center
  followThreshold: 15, // AI: LoL-style dead zone - camera doesn't move until player is this far from center
  // AI: Look-ahead distance - how far ahead camera looks in direction of movement
  lookAheadDistance: 40, // AI: LoL-style look-ahead for more dynamic feel

  // AI: Free camera mode properties
  isFreeCamera: false, // Toggle between free movement and player following
  moveSpeed: 24, // Camera movement speed in pixels per frame (3x faster)
  keysPressed: { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false },
  
  // AI: Updates camera position with smooth following and boundary constraints
  update() {
  // Zoom is locked to 1x
  this.zoom = 1;
  this.targetZoom = 1;
  // AI: Calculate effective viewport dimensions (1:1 since zoom is locked to 1x)
  this.width = game.width;
  this.height = game.height;
    
    // AI: Handle free camera movement vs player following
    if (this.isFreeCamera) {
      // AI: Free camera mode - handle keyboard input for movement
      let moveX = 0;
      let moveY = 0;

      // WASD keys
      if (this.keysPressed.w || this.keysPressed.up) moveY -= this.moveSpeed;
      if (this.keysPressed.s || this.keysPressed.down) moveY += this.moveSpeed;
      if (this.keysPressed.a || this.keysPressed.left) moveX -= this.moveSpeed;
      if (this.keysPressed.d || this.keysPressed.right) moveX += this.moveSpeed;

      // Apply movement to camera
      this.x += moveX;
      this.y += moveY;

      // Clamp to world boundaries - never show outside world edges
      this.x = Math.max(0, Math.min(this.x, Math.max(0, game.WORLD_WIDTH - this.width)));
      this.y = Math.max(0, Math.min(this.y, Math.max(0, game.WORLD_HEIGHT - this.height)));

    } else {
      // AI: Player following mode (LoL-style camera)
    const cameraCenterX = this.x + this.width / 2;
    const cameraCenterY = this.y + this.height / 2;
    
    // AI: Calculate distance from player to camera center
    const distanceFromCenter = Math.hypot(
      game.player.x - cameraCenterX,
      game.player.y - cameraCenterY
    );
    
      // AI: LoL-style camera with dead zone and look-ahead
    if (distanceFromCenter > this.followThreshold) {
        // AI: Calculate player's movement direction for look-ahead
        const playerMoveX = game.player.x - (game.player.lastX || game.player.x);
        const playerMoveY = game.player.y - (game.player.lastY || game.player.y);
        const movementMagnitude = Math.hypot(playerMoveX, playerMoveY);

        // AI: Calculate look-ahead offset if player is moving
        let lookAheadX = 0, lookAheadY = 0;
        if (movementMagnitude > 1) { // Only apply look-ahead if moving significantly
          const normalizedMoveX = playerMoveX / movementMagnitude;
          const normalizedMoveY = playerMoveY / movementMagnitude;
          lookAheadX = normalizedMoveX * this.lookAheadDistance;
          lookAheadY = normalizedMoveY * this.lookAheadDistance;
        }

        // AI: Calculate desired camera position with look-ahead
        let desiredX = game.player.x - this.width / 2 + lookAheadX;
        let desiredY = game.player.y - this.height / 2 + lookAheadY;

        // AI: Always clamp camera to show only world content
        desiredX = Math.max(0, Math.min(desiredX, Math.max(0, game.WORLD_WIDTH - this.width)));
        desiredY = Math.max(0, Math.min(desiredY, Math.max(0, game.WORLD_HEIGHT - this.height)));

        // AI: Smooth camera movement towards desired position
        this.targetX += (desiredX - this.targetX) * 0.1;
        this.targetY += (desiredY - this.targetY) * 0.1;
      }

      // AI: Store current position for next frame's movement calculation
      game.player.lastX = game.player.x;
      game.player.lastY = game.player.y;
    
    // AI: Smooth camera movement towards target position
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    }
    
    // AI: Final clamp to ensure camera never shows outside world boundaries
    this.x = Math.max(0, Math.min(this.x, Math.max(0, game.WORLD_WIDTH - this.width)));
    this.y = Math.max(0, Math.min(this.y, Math.max(0, game.WORLD_HEIGHT - this.height)));
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

  // Ensure a world generator exists (use terrain seed if available)
  if (!game._worldGenerator) game._worldGenerator = new WorldGenerator(game.terrain && game.terrain.seed);

  // Clear canvas to black
  ctx.clearRect(0, 0, game.width, game.height);
  
  // Fill only the world bounds area with sand color
  const worldScreenX = -camera.x;
  const worldScreenY = -camera.y;
  const worldScreenWidth = game.WORLD_WIDTH;
  const worldScreenHeight = game.WORLD_HEIGHT;
  
  ctx.fillStyle = '#c9b98a'; // Desert sand color
  ctx.fillRect(worldScreenX, worldScreenY, worldScreenWidth, worldScreenHeight);

  // Compute visible chunk range
  const chunkX0 = Math.floor(camera.x / CHUNK_PIXEL_SIZE);
  const chunkY0 = Math.floor(camera.y / CHUNK_PIXEL_SIZE);
  const chunkX1 = Math.floor((camera.x + camera.width) / CHUNK_PIXEL_SIZE);
  const chunkY1 = Math.floor((camera.y + camera.height) / CHUNK_PIXEL_SIZE);

  ctx.imageSmoothingEnabled = false;

  for (let cy = chunkY0; cy <= chunkY1; cy++) {
    for (let cx = chunkX0; cx <= chunkX1; cx++) {
      const chunk = game._worldGenerator.getChunk(cx, cy);
      if (!chunk || !chunk.canvas) continue;
      const drawX = cx * CHUNK_PIXEL_SIZE - camera.x;
      const drawY = cy * CHUNK_PIXEL_SIZE - camera.y;
      try {
        ctx.drawImage(chunk.canvas, Math.floor(drawX), Math.floor(drawY), CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);
      } catch (e) {
        // Defensive fallback: ignore drawing errors
      }
    }
  }
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
