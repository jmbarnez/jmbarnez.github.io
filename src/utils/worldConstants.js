// src/utils/worldConstants.js
// Fixed world dimensions for deterministic terrain generation

// Fixed world dimensions - scaled up 4x from original to provide a larger travel area
// Original was 800x400; increase to 3200x1600 so the generated world is larger while
// the canvas remains screen-sized for rendering.
// Reduced world dimensions to match pixel/petite aesthetic (half of previous)
export const WORLD_WIDTH = 800 * 2; // 1600
export const WORLD_HEIGHT = 400 * 2; // 800

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
  WET_SAND: { threshold: 0.35, color: '#d4a574', name: 'wet_sand' },
  DRY_SAND: { threshold: 0.6, color: '#e7d8b0', name: 'dry_sand' },
  VEGETATION: { threshold: 0.8, color: '#22c55e', name: 'vegetation' }
};
