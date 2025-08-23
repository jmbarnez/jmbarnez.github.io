// src/utils/worldConstants.js
// Fixed world dimensions for deterministic terrain generation

// Fixed world dimensions - scaled up 10x for a much larger world
// Original was 1600x800, now 16000x8000 for massive exploration area
export const WORLD_WIDTH = 800 * 2 * 10; // 16000
export const WORLD_HEIGHT = 400 * 2 * 10; // 8000

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
