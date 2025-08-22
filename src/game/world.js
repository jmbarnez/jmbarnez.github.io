// AI: This file has been refactored to support a camera with zoom,
// seeded procedural terrain generation, and a fixed world size.

import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { seededNoise, saveTerrainSeed, loadTerrainSeed, generateRandomSeed } from '../utils/noise.js';
import { WORLD_WIDTH, WORLD_HEIGHT, OASIS_CONFIG, BIOMES, PERMANENT_TERRAIN_SEED } from '../utils/worldConstants.js';

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

// Generate procedural terrain with seeded noise
async function generateTerrain(seed) {
  // For now we use a fixed, static sand map. This keeps the world deterministic
  // and simple while preserving the public API so generated features can be
  // reintroduced later without changing callers.
  console.log(`[TERRAIN] Generating simple static sand terrain (seed: ${seed})`);

  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD_WIDTH;
  terrainCanvas.height = WORLD_HEIGHT;
  const ctx = terrainCanvas.getContext('2d');

  // Fill base with dry sand color to avoid any fallback black pixels while
  // generation/caching completes. This ensures a visible base immediately.
  try {
    const baseColor = (BIOMES && BIOMES.DRY_SAND && BIOMES.DRY_SAND.color) ? BIOMES.DRY_SAND.color : '#e7d8b0';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  } catch (e) {
    // Non-fatal: if fill fails, continue with generation
    console.warn('Failed to fill base terrain color:', e);
  }

  // To improve performance, generate terrain at a lower resolution and scale up.
  // Using DOWNSAMPLE = 4 produces a much faster generation (1/16th pixels).
  const DOWNSAMPLE = TERRAIN_DOWNSAMPLE; // 4x downsample -> 16x fewer pixels
  const smallW = Math.max(1, Math.ceil(WORLD_WIDTH / DOWNSAMPLE));
  const smallH = Math.max(1, Math.ceil(WORLD_HEIGHT / DOWNSAMPLE));

  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW;
  smallCanvas.height = smallH;
  const sctx = smallCanvas.getContext('2d');
  const smallImage = sctx.createImageData(smallW, smallH);
  const sdata = smallImage.data;

  // Prepare low-res water mask
  const waterMaskLowRes = new Array(smallH);
  for (let y = 0; y < smallH; y++) {
    waterMaskLowRes[y] = new Array(smallW).fill(false);
  }

  // Use permanent seed if none provided for deterministic world
  if (seed === undefined || seed === null) seed = PERMANENT_TERRAIN_SEED;
  if (typeof seed !== 'number' || isNaN(seed)) seed = PERMANENT_TERRAIN_SEED;

  // Noise parameters (scaled for small canvas) - use fewer octaves for speed
  const baseScale = 0.012 * DOWNSAMPLE;
  const variationScale = 0.06 * DOWNSAMPLE;

  const oasisCx = OASIS_CONFIG.centerX / DOWNSAMPLE;
  const oasisCy = OASIS_CONFIG.centerY / DOWNSAMPLE;
  const pondR = (OASIS_CONFIG.pondRadius || Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.02) / DOWNSAMPLE;
  const oasisR = (OASIS_CONFIG.radius || Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.08) / DOWNSAMPLE;

  // River generation: create a meandering centerline across the map using 1D noise
  // and mark pixels within a variable width as water. Optimized for speed.
  const riverNoiseScale = 0.02 * DOWNSAMPLE; // slightly coarser
  const riverWidthBase = Math.max(2, Math.floor(smallH * 0.04));

  // Generate river center y for each x (sx)
  const riverCenter = new Array(smallW);
  for (let sx = 0; sx < smallW; sx++) {
    // 1D noise across x produces meandering
    const n1 = seededNoise(sx * riverNoiseScale, 0, seed + 3000, 4, 0.5, riverNoiseScale);
    // bias river vertically across the map
    const t = 0.2 + 0.6 * n1; // keep away from extreme edges
    riverCenter[sx] = Math.floor(t * smallH);
  }

  // Fill water mask based on distance to river center with noise-modulated width
  // Efficient column-based water marking: for each column, mark a band around center
  for (let sx = 0; sx < smallW; sx++) {
    const centerY = riverCenter[sx];
    const wx = sx * DOWNSAMPLE;
    // width modulation per column (cheap)
    const wNoise = seededNoise(wx * 0.06, 0, seed + 4000, 1, 0.5, 0.06);
    const width = Math.max(1, Math.round(riverWidthBase * (1 + (wNoise - 0.5) * 0.7)));
    const y0 = Math.max(0, centerY - width - 2);
    const y1 = Math.min(smallH - 1, centerY + width + 2);
    // precompute base streaks for column for speed
    for (let sy = 0; sy < smallH; sy++) {
      const pi = (sy * smallW + sx) * 4;
      const wy = sy * DOWNSAMPLE;
      const dryColor = BIOMES.DRY_SAND.color || '#e7d8b0';
      const r = parseInt(dryColor.slice(1, 3), 16);
      const g = parseInt(dryColor.slice(3, 5), 16);
      const b = parseInt(dryColor.slice(5, 7), 16);
      // Subtle grain/streak using low-frequency seeded noise. Lower amplitude
      // and a small global darken give a moodier sand while staying cheap.
      const streak = seededNoise((wx + wy * 0.3) * 0.02, (wy - wx * 0.3) * 0.02, seed + 5000, 1, 0.5, 0.02);
      const darkenBase = -8; // small global darken in RGB space
      const streakVariation = Math.floor((streak - 0.5) * 8); // lower amplitude
      sdata[pi] = Math.max(0, Math.min(255, r + darkenBase + streakVariation));
      sdata[pi + 1] = Math.max(0, Math.min(255, g + darkenBase + streakVariation));
      sdata[pi + 2] = Math.max(0, Math.min(255, b + darkenBase + streakVariation));
      sdata[pi + 3] = 255;
      waterMaskLowRes[sy][sx] = (sy >= y0 && sy <= y1);
    }
  }

  // Optional single-pass smoothing (cheaper)
  {
    const next = new Array(smallH);
    for (let y = 0; y < smallH; y++) next[y] = new Array(smallW).fill(false);
    for (let y = 0; y < smallH; y++) {
      for (let x = 0; x < smallW; x++) {
        let count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const ny = y + oy, nx = x + ox;
            if (ny < 0 || ny >= smallH || nx < 0 || nx >= smallW) continue;
            if (waterMaskLowRes[ny][nx]) count++;
          }
        }
        next[y][x] = (count >= 3);
      }
    }
    for (let y = 0; y < smallH; y++) waterMaskLowRes[y] = next[y];
  }

  // Apply wet-sand gradient around river
  const maxWetRadius = Math.max(3, Math.floor(Math.min(smallW, smallH) * 0.04));
  for (let sy2 = 0; sy2 < smallH; sy2++) {
    for (let sx2 = 0; sx2 < smallW; sx2++) {
      const pi = (sy2 * smallW + sx2) * 4;
      if (waterMaskLowRes[sy2][sx2]) {
        const d = seededNoise(sx2 * 0.01, sy2 * 0.01, seed + 6000, 2, 0.5, 0.01);
        const waterColor = (d > 0.6) ? (BIOMES.DEEP_WATER.color || '#1e3a8a') : (BIOMES.WATER.color || '#3b82f6');
        const wr = parseInt(waterColor.slice(1, 3), 16);
        const wg = parseInt(waterColor.slice(3, 5), 16);
        const wb = parseInt(waterColor.slice(5, 7), 16);
        sdata[pi] = wr; sdata[pi + 1] = wg; sdata[pi + 2] = wb; sdata[pi + 3] = 255;
      } else {
        let nearest = Infinity;
        for (let ry = -maxWetRadius; ry <= maxWetRadius; ry++) {
          const yy = sy2 + ry;
          if (yy < 0 || yy >= smallH) continue;
          for (let rx = -maxWetRadius; rx <= maxWetRadius; rx++) {
            const xx = sx2 + rx;
            if (xx < 0 || xx >= smallW) continue;
            if (waterMaskLowRes[yy][xx]) {
              const dist2 = rx * rx + ry * ry;
              if (dist2 < nearest) nearest = dist2;
            }
          }
        }
        const dist = Math.sqrt(nearest === Infinity ? Infinity : nearest);
        const wetFactor = (nearest === Infinity) ? 0 : Math.max(0, 1 - dist / Math.max(1, maxWetRadius));
        const dryColor = BIOMES.DRY_SAND.color || '#e7d8b0';
        const wetColor = BIOMES.WET_SAND.color || '#d4a574';
        const dryR = parseInt(dryColor.slice(1, 3), 16);
        const dryG = parseInt(dryColor.slice(3, 5), 16);
        const dryB = parseInt(dryColor.slice(5, 7), 16);
        const wetR = parseInt(wetColor.slice(1, 3), 16);
        const wetG = parseInt(wetColor.slice(3, 5), 16);
        const wetB = parseInt(wetColor.slice(5, 7), 16);
        const curR = sdata[pi], curG = sdata[pi + 1], curB = sdata[pi + 2];
        const finalR = Math.round(curR * (1 - wetFactor * 0.95) + wetR * (wetFactor * 0.95));
        const finalG = Math.round(curG * (1 - wetFactor * 0.95) + wetG * (wetFactor * 0.95));
        const finalB = Math.round(curB * (1 - wetFactor * 0.95) + wetB * (wetFactor * 0.95));
        sdata[pi] = Math.max(0, Math.min(255, finalR));
        sdata[pi + 1] = Math.max(0, Math.min(255, finalG));
        sdata[pi + 2] = Math.max(0, Math.min(255, finalB));
        sdata[pi + 3] = 255;
      }
    }
  }

  // Before drawing, try to load cached low-res image from IndexedDB
  const cacheKey = `terrain:${seed}:${WORLD_WIDTH}x${WORLD_HEIGHT}:d${DOWNSAMPLE}`;

  // IndexedDB helpers
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open('terrain-cache', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function getCached(db, key) {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      const tx = db.transaction('maps', 'readonly');
      const store = tx.objectStore('maps');
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });

  }

  async function putCached(db, key, value) {
    return new Promise((resolve) => {
      if (!db) return resolve(false);
      const tx = db.transaction('maps', 'readwrite');
      const store = tx.objectStore('maps');
      const r = store.put(value, key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => resolve(false);
    });
  }

  const db = await openDB();
  const cached = db ? await getCached(db, cacheKey) : null;

  if (cached && cached.blob) {
    try {
      // Load cached blob into smallCanvas
      const imgBitmap = await createImageBitmap(cached.blob);
      sctx.imageSmoothingEnabled = false;
      sctx.clearRect(0, 0, smallW, smallH);
      sctx.drawImage(imgBitmap, 0, 0, smallW, smallH);

      // Reconstruct smallImage data and water mask from the cached image
      const reconstructed = sctx.getImageData(0, 0, smallW, smallH).data;
      for (let i = 0; i < reconstructed.length; i++) smallImage.data[i] = reconstructed[i];
      for (let sy = 0; sy < smallH; sy++) {
        for (let sx = 0; sx < smallW; sx++) {
          const idx = (sy * smallW + sx) * 4;
          const rr = smallImage.data[idx];
          const gg = smallImage.data[idx + 1];
          const bb = smallImage.data[idx + 2];
          // Heuristic: water pixels are bluer than others
          waterMaskLowRes[sy][sx] = (bb > rr && bb > gg && bb > 100);
        }
      }
    } catch (e) {
      // Fallthrough to regenerate if cache read fails
      console.warn('Terrain cache load failed, regenerating:', e);
    }
  } else {
    // No cache found — generate low-res image (already done in sdata)
    sctx.putImageData(smallImage, 0, 0);
    // Save low-res canvas to cache asynchronously
    try {
      const blob = await new Promise(res => smallCanvas.toBlob(res, 'image/png'));
      if (db && blob) await putCached(db, cacheKey, { blob });
    } catch (e) {
      // ignore cache write errors
    }
  }

  // Draw low-res image and scale up into the final terrain canvas
  sctx.putImageData(smallImage, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // Upscale low-res water mask to full resolution so existing systems that
  // expect a full-size waterMask continue to work without changes.
  const waterMask = new Array(WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    waterMask[y] = new Array(WORLD_WIDTH).fill(false);
  }

  for (let sy = 0; sy < smallH; sy++) {
    for (let sx = 0; sx < smallW; sx++) {
      const val = !!waterMaskLowRes[sy][sx];
      const startY = sy * DOWNSAMPLE;
      const startX = sx * DOWNSAMPLE;
      for (let oy = 0; oy < DOWNSAMPLE; oy++) {
        const wy = startY + oy;
        if (wy >= WORLD_HEIGHT) break;
        for (let ox = 0; ox < DOWNSAMPLE; ox++) {
          const wx = startX + ox;
          if (wx >= WORLD_WIDTH) break;
          waterMask[wy][wx] = val;
        }
      }
    }
  }

  // Store water mask and low-res factor
  game.terrain.waterMaskLowRes = waterMaskLowRes;
  game.terrain.lowResFactor = DOWNSAMPLE;

  // Store terrain data
  game.terrain = game.terrain || {};
  game.terrain.map = terrainCanvas;
  game.terrain.waterMask = waterMask;
  game.terrain.seed = seed;

  console.log(`[TERRAIN] Created static sand terrain ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
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
  zoom: 1, // Current zoom level
  targetZoom: 1, // Target zoom will snap to allowedZooms
  // Allowed discrete zoom levels for pixel-perfect scaling
  allowedZooms: [1, 2],
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
  // AI: Smoothly interpolate zoom toward targetZoom (discrete targets)
  const zoomSmoothing = 0.2; // Faster convergence to discrete zoom
  this.zoom += (this.targetZoom - this.zoom) * zoomSmoothing;
  // Clamp to allowed zoom range
  const minZoom = Math.min(...this.allowedZooms);
  const maxZoom = Math.max(...this.allowedZooms);
  this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom));
  // Snap to target when close to avoid fractional scaling artifacts
  if (Math.abs(this.targetZoom - this.zoom) < 0.02) this.zoom = this.targetZoom;
  // AI: Calculate effective viewport dimensions based on zoom
  this.width = game.width / this.zoom;
  this.height = game.height / this.zoom;
    
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

      // Clamp to world boundaries
      this.x = Math.max(0, Math.min(this.x, game.WORLD_WIDTH - this.width));
      this.y = Math.max(0, Math.min(this.y, game.WORLD_HEIGHT - this.height));

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

        // AI: Center camera on world when viewport is larger than world dimensions
        if (this.width >= game.WORLD_WIDTH) {
          desiredX = (game.WORLD_WIDTH - this.width) / 2;
        } else {
      desiredX = Math.max(0, Math.min(desiredX, game.WORLD_WIDTH - this.width));
        }

        if (this.height >= game.WORLD_HEIGHT) {
          desiredY = (game.WORLD_HEIGHT - this.height) / 2;
        } else {
      desiredY = Math.max(0, Math.min(desiredY, game.WORLD_HEIGHT - this.height));
        }

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
    
    // AI: Final clamp to ensure camera never goes outside boundaries
    // This handles edge cases where smoothing might overshoot
    if (this.width >= game.WORLD_WIDTH) {
      this.x = (game.WORLD_WIDTH - this.width) / 2;
    } else {
    this.x = Math.max(0, Math.min(this.x, game.WORLD_WIDTH - this.width));
    }

    if (this.height >= game.WORLD_HEIGHT) {
      this.y = (game.WORLD_HEIGHT - this.height) / 2;
    } else {
    this.y = Math.max(0, Math.min(this.y, game.WORLD_HEIGHT - this.height));
    }
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
  // If terrain hasn't been generated yet, trigger generation and skip this frame.
  // Note: generateTerrain is async (uses IndexedDB), so we must not try to draw
  // until `game.terrain.map` is populated to avoid drawImage errors.
  if (!game.terrain.map) {
    // Kick off generation if not already running
    if (!game.terrain._generating) {
      game.terrain._generating = true;
      // fire-and-forget; when complete it will assign game.terrain.map
      generateTerrain(game.terrain.seed).finally(() => { game.terrain._generating = false; });
    }
    return;
  }

  const { ctx } = game;
  if (!ctx) {
    console.warn('Canvas context not available in drawTerrain');
    return;
  }

  // Clear the canvas
  ctx.clearRect(0, 0, game.width, game.height);

  // Draw the portion of the terrain that corresponds to the camera view so the ground
  // moves with the world and feels natural. This prevents the "floating in space" effect.
  // Source rectangle is in world coordinates on the pre-rendered terrain map.
  ctx.drawImage(
    game.terrain.map,
    Math.floor(camera.x), Math.floor(camera.y), // source x,y
    Math.max(1, Math.floor(camera.width)), Math.max(1, Math.floor(camera.height)), // source w,h
    0, 0, // destination x,y
    game.width, game.height // dest w,h
  );
}

// Check if a position is in water using the terrain water mask
export function isInWater(x, y) {
  // Clamp coordinates to world bounds
  const clampedX = Math.max(0, Math.min(WORLD_WIDTH - 1, Math.floor(x)));
  const clampedY = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.floor(y)));

  // Check water mask if terrain is generated
  if (game.terrain && game.terrain.waterMask && game.terrain.waterMask[clampedY]) {
    return game.terrain.waterMask[clampedY][clampedX];
  }

  return false; // Default to not water if terrain not generated
}

// Export the constants for other modules to use
export { WORLD_WIDTH, WORLD_HEIGHT };
