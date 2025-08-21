import { getGlobalVolume, onVolumeChange } from './constants.js';

// Combined SFX module: WebAudio-based complex sounds + simple Audio element effects.
// This file replaces the previous split `soundEffects.js` and `sfx.js` modules.

let audioCtx = null;
let laserNode = null;

// Simple DOM Audio elements for UI sounds
const btnHoverSound = new Audio('/assets/btn-hover.wav');
const btnClickSound = new Audio('/assets/btn-click.wav');

// Volume & mute state managed here
let audioUnlocked = false;
let muted = false;

function updateVolume() {
  const globalVolume = getGlobalVolume();
  btnHoverSound.volume = 0.1 * globalVolume;
  btnClickSound.volume = 0.1 * globalVolume;
  // Also update laser node gain if active
  if (laserNode && audioCtx) {
    const targetGain = Math.max(0.0001, 0.004 * globalVolume);
    try { laserNode.mainGain.gain.exponentialRampToValueAtTime(targetGain, audioCtx.currentTime + 0.1); } catch (_) {}
  }
}

// Subscribe to global volume changes
onVolumeChange(() => updateVolume());

// Initialize volumes from saved state
updateVolume();

function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioCtx = null; }
  }
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  const promises = [btnHoverSound.play().catch(()=>{}), btnClickSound.play().catch(()=>{})];
  Promise.all(promises).then(() => {
    [btnHoverSound, btnClickSound].forEach(s => { s.pause(); s.currentTime = 0; });
    audioUnlocked = true;
    const ctx = getCtx(); if (ctx && ctx.state === 'suspended') ctx.resume();
    document.removeEventListener('click', unlockAudio);
  }).catch(()=>{});
}
document.addEventListener('click', unlockAudio, { once: true });

export function setMuted(value) { muted = !!value; try { localStorage.setItem('muted', String(muted)); } catch (_) {} }
export function isMuted() { return muted; }

// Simple UI sounds
export function playHoverSound() { if (!audioUnlocked || muted) return; btnHoverSound.currentTime = 0; btnHoverSound.play().catch(()=>{}); }
export function playClickSound() { if (!audioUnlocked || muted) return; btnClickSound.currentTime = 0; btnClickSound.play().catch(()=>{}); }

// Tiny chiptune beep used by other UI sounds
function beep(freq = 880, duration = 0.08, type = 'square', gain = 0.02 * getGlobalVolume()) {
  const ctx = getCtx(); if (!ctx || muted) return;
  const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = gain; o.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime; o.start(now); g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + duration); o.stop(now + duration + 0.02);
}

export function playPickupSound() { beep(740, 0.06, 'square'); setTimeout(() => beep(980, 0.06, 'triangle'), 40); }
export function playPopSound() { beep(300, 0.04, 'sawtooth', 0.04); }

/**
 * Initializes the AudioContext. Must be called after a user interaction.
 */
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

/**
 * Plays a sound for a successful mining action.
 */
export function playMiningSound() {
  initAudio();
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.15 * getGlobalVolume(), audioCtx.currentTime);

  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.3);
}

/**
 * Plays a sound for an item drop.
 */
export function playItemDropSound() {
  initAudio();
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.2 * getGlobalVolume(), audioCtx.currentTime);

  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.5);
}

/**
 * Starts the mining laser sound with a low-pitched, electric hum.
 */
export function startLaserSound() {
  initAudio();
  if (!audioCtx || laserNode) return;

  // --- AI: Create a more complex audio graph for a textured, electric sound ---

  // 1. Main Gain Node: Controls the final output volume of the entire effect.
  const mainGain = audioCtx.createGain();
  mainGain.gain.setValueAtTime(0.004 * getGlobalVolume(), audioCtx.currentTime); // Extremely quiet overall volume
  mainGain.connect(audioCtx.destination);

  // 2. Low-frequency hum (the base of the laser sound).
  const humOscillator = audioCtx.createOscillator();
  humOscillator.type = 'sine';
  humOscillator.frequency.setValueAtTime(60, audioCtx.currentTime); // Lower-pitched hum
  humOscillator.connect(mainGain);

  // 3. Electric "sizzle" effect using a square wave.
  const sizzleOscillator = audioCtx.createOscillator();
  sizzleOscillator.type = 'square';
  sizzleOscillator.frequency.setValueAtTime(200, audioCtx.currentTime); // Base frequency for the sizzle

  // 4. LFO (Low-Frequency Oscillator) to modulate the sizzle's frequency.
  // This creates the unstable, "electric" feeling.
  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(15, audioCtx.currentTime); // Speed of the electric crackle

  // 5. LFO Gain: Controls how much the LFO affects the sizzle's frequency.
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(10, audioCtx.currentTime); // Amount of frequency modulation
  lfo.connect(lfoGain);
  lfoGain.connect(sizzleOscillator.frequency); // Modulate the frequency

  // 6. Sizzle Gain: Controls the volume of the electric sizzle.
  const sizzleGain = audioCtx.createGain();
  sizzleGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  sizzleOscillator.connect(sizzleGain);
  sizzleGain.connect(mainGain);

  // --- AI: Start all oscillators ---
  humOscillator.start(audioCtx.currentTime);
  sizzleOscillator.start(audioCtx.currentTime);
  lfo.start(audioCtx.currentTime);

  // Store references to all created nodes for cleanup.
  laserNode = {
    hum: humOscillator,
    sizzle: sizzleOscillator,
    lfo: lfo,
    mainGain: mainGain,
  };
}

/**
 * Stops the mining laser sound and disconnects all associated audio nodes.
 */
export function stopLaserSound() {
  if (laserNode && audioCtx) {
    const now = audioCtx.currentTime;
    // Fade out the main gain to prevent a "click" when stopping.
    laserNode.mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    // Stop all oscillators after the fade-out is complete.
    laserNode.hum.stop(now + 0.1);
    laserNode.sizzle.stop(now + 0.1);
    laserNode.lfo.stop(now + 0.1);

    laserNode = null;
  }
}
/**
 * Plays a sound when a mining cycle is complete.
 */
export function playCycleCompleteSound() {
  initAudio();
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(330, audioCtx.currentTime + 0.2);
  gainNode.gain.setValueAtTime(0.1 * getGlobalVolume(), audioCtx.currentTime);

  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.2);
}

/**
 * Plays a sound for the player's gun firing.
 */
export function playGunshotSound() {
    initAudio();
    if (!audioCtx) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1 * getGlobalVolume(), audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
}

/**
 * Plays a sound for an enemy being hit.
 */
/**
 * AI: Plays a tiny explosion sound effect when projectiles hit enemies.
 * Creates a brief, sharp explosion-like sound using noise and frequency modulation.
 */
export function playEnemyHitSound() {
    initAudio();
    if (!audioCtx) return;

    // AI: Create multiple oscillators for a richer explosion sound
    const oscillator1 = audioCtx.createOscillator();
    const oscillator2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filterNode = audioCtx.createBiquadFilter();

    // AI: Connect audio nodes for explosion effect
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(filterNode);
    filterNode.connect(audioCtx.destination);

    // AI: Configure oscillators for explosion-like sound
    oscillator1.type = 'sawtooth';
    oscillator2.type = 'square';
    
    // AI: Start with high frequency and quickly drop (explosion characteristic)
    oscillator1.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator1.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
    
    oscillator2.frequency.setValueAtTime(400, audioCtx.currentTime);
    oscillator2.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);

    // AI: Configure low-pass filter to soften the explosion
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(2000, audioCtx.currentTime);
    filterNode.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);

    // AI: Sharp attack, quick decay for explosion effect
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.15 * getGlobalVolume(), audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);

    // AI: Very short duration for snappy explosion sound
    oscillator1.start(audioCtx.currentTime);
    oscillator1.stop(audioCtx.currentTime + 0.15);
    oscillator2.start(audioCtx.currentTime);
    oscillator2.stop(audioCtx.currentTime + 0.15);
}

/**
 * AI: Plays a bug death sound effect when enemies are killed.
 * Creates a brief, satisfying death sound with frequency drop.
 */
export function playBugDeathSound() {
    initAudio();
    if (!audioCtx) return;

    // AI: Create oscillator for bug death sound
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filterNode = audioCtx.createBiquadFilter();

    // AI: Connect audio nodes
    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // AI: Configure for bug death sound - high pitched squeal that drops
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);

    // AI: Add filter sweep for organic death sound
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(1200, audioCtx.currentTime);
    filterNode.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
    filterNode.Q.setValueAtTime(2, audioCtx.currentTime);

    // AI: Quick attack, medium decay for satisfying death sound
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12 * getGlobalVolume(), audioCtx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
}

/**
 * AI: Plays a realistic coin collection sound effect when enemies drop gold.
 * Creates a metallic "clink" sound that sounds like actual coins.
 */
export function playCoinSound() {
    initAudio();
    if (!audioCtx) return;

    // AI: Create multiple oscillators for metallic coin sound
    const oscillator1 = audioCtx.createOscillator();
    const oscillator2 = audioCtx.createOscillator();
    const oscillator3 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const filterNode = audioCtx.createBiquadFilter();

    // AI: Connect audio nodes
    oscillator1.connect(filterNode);
    oscillator2.connect(filterNode);
    oscillator3.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // AI: Configure for metallic coin clink - multiple frequencies for realistic sound
    oscillator1.type = 'triangle';
    oscillator2.type = 'triangle';
    oscillator3.type = 'sine';
    
    // AI: Coin-like frequencies with slight detuning for metallic effect
    oscillator1.frequency.setValueAtTime(1047, audioCtx.currentTime); // High C
    oscillator2.frequency.setValueAtTime(1319, audioCtx.currentTime); // E (major third)
    oscillator3.frequency.setValueAtTime(1568, audioCtx.currentTime); // G (perfect fifth)

    // AI: High-pass filter for bright metallic sound
    filterNode.type = 'highpass';
    filterNode.frequency.setValueAtTime(800, audioCtx.currentTime);
    filterNode.Q.setValueAtTime(1, audioCtx.currentTime);

    // AI: Very quick attack and decay for sharp coin clink
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.06 * getGlobalVolume(), audioCtx.currentTime + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);

    oscillator1.start(audioCtx.currentTime);
    oscillator1.stop(audioCtx.currentTime + 0.15);
    oscillator2.start(audioCtx.currentTime);
    oscillator2.stop(audioCtx.currentTime + 0.15);
    oscillator3.start(audioCtx.currentTime);
    oscillator3.stop(audioCtx.currentTime + 0.15);
}