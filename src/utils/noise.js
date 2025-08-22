// src/utils/noise.js
// Seeded pseudo-random number generator and noise functions for deterministic terrain generation

/**
 * Mulberry32 seeded PRNG - fast and good quality
 * @param {number} seed - The seed value
 * @returns {Function} A function that returns pseudo-random numbers between 0 and 1
 */
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

/**
 * Simple seeded noise function using multiple octaves of smoothed random
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} seed - Seed for deterministic generation
 * @param {number} octaves - Number of noise octaves (default: 4)
 * @param {number} persistence - How much each octave contributes (default: 0.5)
 * @param {number} scale - Base scale of the noise (default: 0.1)
 * @returns {number} Noise value between 0 and 1
 */
export function seededNoise(x, y, seed, octaves = 4, persistence = 0.5, scale = 0.1) {
  // Debug logging for seed value
  if (typeof seed !== 'number' || isNaN(seed)) {
    console.error(`[NOISE] CRITICAL: Invalid seed in seededNoise: ${seed} (type: ${typeof seed})`);
    seed = 12345; // Emergency fallback seed
  }

  const prng = mulberry32(seed);
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  // Generate multiple octaves of noise
  for (let i = 0; i < octaves; i++) {
    const sampleX = x * frequency;
    const sampleY = y * frequency;

    // Smooth interpolation of grid points
    const x0 = Math.floor(sampleX);
    const y0 = Math.floor(sampleY);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    // Get random values for the four corners
    const random00 = getSeededRandom(x0, y0, prng, seed);
    const random10 = getSeededRandom(x1, y0, prng, seed);
    const random01 = getSeededRandom(x0, y1, prng, seed);
    const random11 = getSeededRandom(x1, y1, prng, seed);

    // Bilinear interpolation
    const tx = sampleX - x0;
    const ty = sampleY - y0;

    const lerp1 = lerp(random00, random10, smoothStep(tx));
    const lerp2 = lerp(random01, random11, smoothStep(tx));
    const interpolated = lerp(lerp1, lerp2, smoothStep(ty));

    value += interpolated * amplitude;
    maxValue += amplitude;

    amplitude *= persistence;
    frequency *= 2;
  }

  return value / maxValue;
}

/**
 * Generate a seeded random value for a specific grid coordinate
 * @param {number} x - Grid x coordinate
 * @param {number} y - Grid y coordinate
 * @param {Function} prng - The seeded PRNG function
 * @param {number} seed - The original seed value
 * @returns {number} Random value between 0 and 1
 */
function getSeededRandom(x, y, prng, seed) {
  // Create a deterministic seed for this coordinate
  const coordSeed = x * 374761393 + y * 668265263;
  // Use the coordinate seed to generate multiple PRNG calls for better distribution
  prng(); prng(); prng(); // Advance PRNG state
  const tempSeed = (seed ^ coordSeed) >>> 0;
  const tempPrng = mulberry32(tempSeed);
  return tempPrng();
}

/**
 * Smooth interpolation function (smoothstep)
 * @param {number} t - Value to interpolate (0-1)
 * @returns {number} Smoothed value
 */
function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Simple seeded random number generator for basic use cases
 * @param {number} seed - The seed value
 * @returns {number} Random number between 0 and 1
 */
export function seededRandom(seed) {
  const prng = mulberry32(seed);
  return prng();
}

/**
 * Generate a random seed value
 * @returns {number} A random 32-bit integer seed
 */
export function generateRandomSeed() {
  return Math.floor(Math.random() * 0xFFFFFFFF);
}

/**
 * Get the permanent static seed for this game world
 * @returns {number} The permanent seed (0xDEADBEEF for consistency)
 */
export function getStaticWorldSeed() {
  // Using a memorable hex value that generates good terrain
  // This ensures the same terrain is generated every time
  return 0xDEADBEEF; // 3735928559 in decimal
}

/**
 * Store terrain seed in Firebase RTDB (global) and localStorage (cache)
 * @param {number} seed - The seed to store
 */
export async function saveTerrainSeed(seed) {
  try {
    // Save to localStorage for immediate availability
    localStorage.setItem('terrainSeed', seed.toString());
    console.log(`[TERRAIN_SEED] Saved seed ${seed} to localStorage`);

    // Try to save to Firebase RTDB for global consistency
    try {
      const { database } = await import('../utils/firebaseClient.js');
      const { ref, set } = await import('firebase/database');
      await set(ref(database, 'global/terrainSeed'), seed);
      console.log(`[TERRAIN_SEED] Saved seed ${seed} to Firebase RTDB`);
    } catch (firebaseError) {
      console.warn('[TERRAIN_SEED] Could not save to Firebase, continuing with localStorage only:', firebaseError);
    }
  } catch (e) {
    console.warn('Could not save terrain seed to localStorage:', e);
  }
}

/**
 * Load terrain seed from Firebase RTDB (global) first, then localStorage (cache)
 * @returns {Promise<number|null>} The stored seed or null if not found
 */
export async function loadTerrainSeed() {
  try {
    // First try to load from Firebase RTDB (global seed)
    try {
      const { database } = await import('../utils/firebaseClient.js');
      const { ref, get } = await import('firebase/database');
      const snapshot = await get(ref(database, 'global/terrainSeed'));
      if (snapshot.exists()) {
        const globalSeed = snapshot.val();
        if (typeof globalSeed === 'number' && !isNaN(globalSeed)) {
          console.log(`[TERRAIN_SEED] Loaded global seed from Firebase: ${globalSeed}`);
          // Update localStorage cache
          localStorage.setItem('terrainSeed', globalSeed.toString());
          return globalSeed;
        }
      }
    } catch (firebaseError) {
      console.warn('[TERRAIN_SEED] Could not load from Firebase, falling back to localStorage:', firebaseError);
    }

    // Fall back to localStorage
    const stored = localStorage.getItem('terrainSeed');
    const seed = stored ? parseInt(stored, 10) : null;
    if (seed !== null) {
      console.log(`[TERRAIN_SEED] Loaded cached seed from localStorage: ${seed}`);
    }
    return seed;
  } catch (e) {
    console.warn('Could not load terrain seed from localStorage:', e);
    return null;
  }
}
