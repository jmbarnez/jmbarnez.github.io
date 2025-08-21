// AI: This file has been refactored to support a camera with zoom,
// a single static biome (sand), and a world size matching the canvas.

import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';

// Procedural terrain generation with deterministic seed support.
// Exports: generateTerrain(seed) and setTerrainSeed(seed)

function generateTerrain() {
  const { WORLD_WIDTH, WORLD_HEIGHT } = game;
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD_WIDTH;
  terrainCanvas.height = WORLD_HEIGHT;
  const ctx = terrainCanvas.getContext('2d');

  // Solid sand color
  ctx.fillStyle = '#e7d8b0';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  game.terrain = game.terrain || {};
  game.terrain.map = terrainCanvas;
}

export function setTerrainSeed(/* seed */) {
  // No-op for solid terrain; seed not used
  generateTerrain();
}

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
  zoom: 3.5, // AI: Higher initial zoom level for more intimate gameplay
  targetZoom: 3.5, // AI: Target zoom for smooth interpolation
  // AI: Camera smoothing factor - lower values make camera movement more gradual
  smoothing: 0.08, // AI: Reduced to eliminate snapping, creates smoother movement
  // AI: Distance threshold - camera only moves when player is this far from center
  followThreshold: 10, // AI: Much tighter centering on player
  
  // AI: Updates camera position with smooth following and boundary constraints
  update() {
  // AI: Smoothly interpolate zoom toward targetZoom
  const zoomSmoothing = 0.15; // Higher = faster zoom
  this.zoom += (this.targetZoom - this.zoom) * zoomSmoothing;
  // Clamp zoom to reasonable bounds
  this.zoom = Math.max(1.5, Math.min(4.0, this.zoom));
  // AI: Calculate effective viewport dimensions based on zoom
  this.width = game.width / this.zoom;
  this.height = game.height / this.zoom;
    
    // AI: Calculate current camera center point
    const cameraCenterX = this.x + this.width / 2;
    const cameraCenterY = this.y + this.height / 2;
    
    // AI: Calculate distance from player to camera center
    const distanceFromCenter = Math.hypot(
      game.player.x - cameraCenterX,
      game.player.y - cameraCenterY
    );
    
    // AI: Progressive follow system - camera moves more as player gets further from center
    // This eliminates snapping by providing gradual movement instead of hard threshold
    if (distanceFromCenter > this.followThreshold) {
      // AI: Calculate how far beyond threshold the player is (0-1 scale)
      const excessDistance = distanceFromCenter - this.followThreshold;
  const maxExcess = Math.max(1, this.followThreshold); // Prevent divide by zero
  const followStrength = Math.max(0.5, Math.min(1, excessDistance / maxExcess)); // Always at least 0.5 for snappy centering
      
      // AI: Calculate desired camera position centered on player
      let desiredX = game.player.x - this.width / 2;
      let desiredY = game.player.y - this.height / 2;
      
      // AI: Clamp target position to world boundaries
      desiredX = Math.max(0, Math.min(desiredX, game.WORLD_WIDTH - this.width));
      desiredY = Math.max(0, Math.min(desiredY, game.WORLD_HEIGHT - this.height));
      
      // AI: Interpolate between current target and desired position based on follow strength
      this.targetX += (desiredX - this.targetX) * followStrength * 0.1;
      this.targetY += (desiredY - this.targetY) * followStrength * 0.1;
    }
    
    // AI: Smooth camera movement towards target position
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    
    // AI: Final clamp to ensure camera never goes outside boundaries
    // This handles edge cases where smoothing might overshoot
    this.x = Math.max(0, Math.min(this.x, game.WORLD_WIDTH - this.width));
    this.y = Math.max(0, Math.min(this.y, game.WORLD_HEIGHT - this.height));
  },
};

// AI: Draws the visible portion of the terrain, applying camera zoom and translation.
export function drawTerrain() {
  if (!game.terrain.map) generateTerrain();

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

// AI: This function is no longer needed as water has been removed, but is kept for compatibility.
export function isInWater(x, y) {
    return false; // AI: Always return false.
}
