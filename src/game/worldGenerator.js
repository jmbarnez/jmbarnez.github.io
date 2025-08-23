import { CHUNK_TILE_SIZE, TILE_PIXEL_SIZE, CHUNK_PIXEL_SIZE, PERMANENT_TERRAIN_SEED, BIOMES } from '../utils/worldConstants.js';
import { seededNoise } from '../utils/noise.js';

// Basic WorldGenerator implementing chunk caching and tile-grid generation.
export class WorldGenerator {
  constructor(seed = PERMANENT_TERRAIN_SEED) {
    this.seed = (typeof seed === 'number' && !isNaN(seed)) ? seed : PERMANENT_TERRAIN_SEED;
    this.cache = new Map(); // key: `${cx},${cy}` -> chunk
    // Precomputed tile count per chunk
    this.tilesPerChunk = CHUNK_TILE_SIZE * CHUNK_TILE_SIZE;
  }

  _chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  // Simple xor-based chunk seed derivation
  _deriveChunkSeed(cx, cy) {
    return (this.seed ^ (cx * 374761393) ^ (cy * 668265263)) >>> 0;
  }

  // Generate a chunk synchronously - simple desert only
  getChunk(cx, cy) {
    const key = this._chunkKey(cx, cy);
    if (this.cache.has(key)) return this.cache.get(key);

    const chunkSeed = this._deriveChunkSeed(cx, cy);

    // Simple desert - all tiles are dry sand, no water
    const tileGrid = new Uint8Array(this.tilesPerChunk);
    const waterMask = new Uint8Array(this.tilesPerChunk);

    // Fill entire chunk with dry sand (biomeId = 3)
    for (let i = 0; i < this.tilesPerChunk; i++) {
      tileGrid[i] = 3; // dry sand
      waterMask[i] = 0; // no water
    }

    // Create offscreen canvas and draw simple desert
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE)
      : document.createElement('canvas');
    canvas.width = CHUNK_PIXEL_SIZE;
    canvas.height = CHUNK_PIXEL_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Fill entire chunk with desert color
    ctx.fillStyle = BIOMES.DRY_SAND.color || '#c9b98a';
    ctx.fillRect(0, 0, CHUNK_PIXEL_SIZE, CHUNK_PIXEL_SIZE);

    const chunk = { cx, cy, canvas, tileGrid, waterMask, seed: chunkSeed };
    this.cache.set(key, chunk);
    return chunk;
  }

  // Optional: discard distant chunks (keeps only those within radius)
  prune(cx, cy, radiusChunks = 3) {
    const keep = new Set();
    for (let oy = -radiusChunks; oy <= radiusChunks; oy++) {
      for (let ox = -radiusChunks; ox <= radiusChunks; ox++) {
        keep.add(this._chunkKey(cx + ox, cy + oy));
      }
    }
    for (const k of Array.from(this.cache.keys())) {
      if (!keep.has(k)) this.cache.delete(k);
    }
  }
}

export default WorldGenerator;

