// src/utils/worldConstants.js
// Fixed world dimensions for deterministic terrain generation

// Fixed world dimensions - small manageable world for focused gameplay
// Changed to smaller size for better performance and focused experience
// Increase world size for testing (4x area)
// Set smaller world dimensions per user request
export const WORLD_WIDTH = 1600; // smaller world width
export const WORLD_HEIGHT = 800; // smaller world height

// How close to the world edge players and camera are allowed to go.
// Set to 0 to allow touching the exact world boundary.
export const WORLD_PADDING = 0;

// Tile / chunk sizing for chunked tile-based world generation
// TILE_PIXEL_SIZE: size of a single tile in pixels (matches pixel-art grid)
export const TILE_PIXEL_SIZE = 32;
// CHUNK_TILE_SIZE: number of tiles per chunk (square)
export const CHUNK_TILE_SIZE = 32;
// CHUNK_PIXEL_SIZE: pixel size of a chunk canvas
export const CHUNK_PIXEL_SIZE = CHUNK_TILE_SIZE * TILE_PIXEL_SIZE; // 1024

// Permanent terrain seed for deterministic world generation
export const PERMANENT_TERRAIN_SEED = 1766955619;

// Oasis configuration - defines the location and shape of the central oasis
export const OASIS_CONFIG = {
  centerX: WORLD_WIDTH * 0.6,  // Position oasis in upper right area
  centerY: WORLD_HEIGHT * 0.35,
  radius: 120,  // Size of the oasis area
  pondRadius: 25  // Size of the central pond
};

// Biome definitions with color and noise thresholds
export const BIOMES = {
  DEEP_WATER: { threshold: 0.0, color: '#1e3a8a', name: 'deep_water' },
  WATER: { threshold: 0.2, color: '#3b82f6', name: 'water' },
  // Darkened sand tones for a more grounded, slightly desaturated beach look
  WET_SAND: { threshold: 0.35, color: '#b88b5a', name: 'wet_sand' },
  DRY_SAND: { threshold: 0.6, color: '#c9b98a', name: 'dry_sand' },
  VEGETATION: { threshold: 0.8, color: '#22c55e', name: 'vegetation' }
};
