import { clamp } from '../core/dom.js';

export const AudioManager = {
  context: null,
  ambientGain: null,
  ambientSources: [],
  ambientVolume: 0.08,
  ambientEnabled: true,
  sfxGain: null,
  masterGain: null,
  walkingSources: [],
  isWalking: false,
  beachAudio: null,
  audioFiles: { beachAmbience: null },
  // Synth SFX configuration
  useSampleSfx: false,
  noiseBuffer: null,
  footstepIntervalId: null,
  windIntervalId: null,
  walkingPanDir: 1,
  // SFX synthesis controls
  useSampleSfx: false,
  noiseBuffer: null,
  // UI click sample
  uiClickAudio: null,
  uiClickVolume: 0.18,
  uiClickLoading: false,
  // UI hover sample
  uiHoverAudio: null,
  uiHoverVolume: 0.16,
  uiHoverLoading: false,
  // Gold pickup sample
  goldPickupAudio: null,
  goldPickupVolume: 0.22,
  goldPickupLoading: false,

  // Generic pickup samples by type (shell/wood/seaweed/fish/location/default)
  pickupCache: new Map(), // key -> { audio: HTMLAudioElement, volume: number }
  pickupVolume: 0.2,

  ensureContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    try {
      if (this.context.state === 'suspended') this.context.resume();
    } catch {}
    return this.context;
  },

  async startAmbientSounds() {
    if (!this.ambientEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (!this.masterGain) {
        this.masterGain = ctx.createGain();
        this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
        this.masterGain.connect(ctx.destination);
      }
      this.ambientGain = this.ambientGain || ctx.createGain();
      this.ambientGain.gain.setValueAtTime(this.ambientVolume, ctx.currentTime);
      this.ambientGain.disconnect?.();
      this.ambientGain.connect(this.masterGain);
      if (!this.sfxGain) {
        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime);
        this.sfxGain.connect(this.masterGain);
      }
      if (await this.loadBeachAudio()) {
        this.playBeachAudio();
      } else {
        // Skip procedural ambient per requirements
      }
    } catch (e) {
      console.warn('Ambient audio setup failed:', e);
    }
  },

  async loadUIClickSound(customUrl) {
    const urls = customUrl ? [customUrl] : [
      // Preferred naming per user
      'assets/btn-click.wav', './assets/btn-click.wav',
      'assets/btn-click.mp3', './assets/btn-click.mp3',
      'assets/btn-click.ogg', './assets/btn-click.ogg',
      // Back-compat
      'assets/ui-click.wav', './assets/ui-click.wav',
      'assets/ui-click.mp3', './assets/ui-click.mp3',
      'assets/ui-click.ogg', './assets/ui-click.ogg'
    ];
    for (const url of urls) {
      try {
        const a = new Audio(url);
        a.volume = this.uiClickVolume;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('UI click load timeout')), 8000);
          a.addEventListener('canplaythrough', () => { clearTimeout(timeout); resolve(); }, { once: true });
          a.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('audio error')); }, { once: true });
          a.load();
        });
        this.uiClickAudio = a;
        return true;
      } catch (e) {
        this.uiClickAudio = null;
        continue;
      }
    }
    return false;
  },

  setUIClickVolume(volume) {
    this.uiClickVolume = clamp(volume, 0, 1);
    if (this.uiClickAudio) this.uiClickAudio.volume = this.uiClickVolume;
  },

  setUIClickSound(url) { return this.loadUIClickSound(url); },

  async setUIClickFromFile(file) {
    try {
      const objectUrl = URL.createObjectURL(file);
      const ok = await this.loadUIClickSound(objectUrl);
      if (!ok) URL.revokeObjectURL(objectUrl);
      return ok;
    } catch {
      return false;
    }
  },

  async loadBeachAudio() {
    const beachTrackURLs = [
      'assets/beach-ambience.mp3',
      './assets/beach-ambience.mp3',
      'beach-ambience.mp3',
      './beach-ambience.mp3',
      'assets/forest-ambience.mp3',
      './assets/forest-ambience.mp3',
    ];

    for (const url of beachTrackURLs) {
      try {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (fetchError) {
          continue;
        }
        this.beachAudio = new Audio(url);
        this.beachAudio.loop = true;
        this.beachAudio.volume = 0;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Loading timeout after 10 seconds')), 10000);
          this.beachAudio.addEventListener('canplaythrough', () => { clearTimeout(timeout); resolve(); }, { once: true });
          this.beachAudio.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('audio error')); }, { once: true });
          this.beachAudio.load();
        });
        return true;
      } catch (e) {
        this.beachAudio = null;
        continue;
      }
    }
    return false;
  },

  playBeachAudio() {
    if (!this.beachAudio || !this.ambientEnabled) return;
    const playPromise = this.beachAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => this.fadeInAudio()).catch(() => {
        // No fallback to procedural ambient
      });
    }
    this.ambientSources.push({ source: this.beachAudio });
  },

  fadeInAudio() {
    if (!this.beachAudio) return;
    const targetVolume = this.ambientVolume;
    const fadeSteps = 30;
    const fadeInterval = 100;
    let currentStep = 0;
    const fade = setInterval(() => {
      currentStep++;
      const volume = (currentStep / fadeSteps) * targetVolume;
      this.beachAudio.volume = Math.min(volume, targetVolume);
      if (currentStep >= fadeSteps) clearInterval(fade);
    }, fadeInterval);
  },

  // Ambient procedural functions intentionally omitted
  createWaveSound() {},
  createSeagullSound() {},
  createWindSound() {},
  startWalkingSounds() {
    // Footsteps removed; keep very subtle ambient wind while exploring
    try { this.stopWalkingSounds(); } catch {}
    const ctx = this.ensureContext(); if (!ctx) return;
    if (!this.masterGain) { this.masterGain = ctx.createGain(); this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime); this.masterGain.connect(ctx.destination); }
    if (!this.ambientGain) { this.ambientGain = ctx.createGain(); this.ambientGain.gain.setValueAtTime(this.ambientVolume, ctx.currentTime); this.ambientGain.connect(this.masterGain); }
    // Ambient wind: soft filtered noise pulses to ambient path every few seconds
    this.windIntervalId = setInterval(() => {
      const base = 0.015 + Math.random()*0.02;
      this.playNoiseBurst({ durationMs: 300, gain: base, filterType: 'lowpass', filterFreq: 900, pan: 0, toAmbient: true });
    }, 3000);
  },
  stopWalkingSounds() {
    if (this.footstepIntervalId) { clearInterval(this.footstepIntervalId); this.footstepIntervalId = null; }
    if (this.windIntervalId) { clearInterval(this.windIntervalId); this.windIntervalId = null; }
  },

  stopAmbientSounds() {
    if (this.beachAudio) {
      this.beachAudio.pause();
      this.beachAudio.currentTime = 0;
    }
    this.ambientSources.forEach(({ source }) => {
      try { if (source && source.stop) source.stop(); if (source && source.pause) source.pause(); } catch {}
    });
    this.ambientSources = [];
    if (this.ambientGain) { this.ambientGain.disconnect(); this.ambientGain = null; }
  },

  setAmbientVolume(volume) {
    this.ambientVolume = clamp(volume, 0, 1);
    if (this.beachAudio) this.beachAudio.volume = this.ambientVolume;
    if (this.ambientGain && this.context) this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.context.currentTime);
  },

  toggleAmbientSounds() {
    this.ambientEnabled = !this.ambientEnabled;
    if (this.ambientEnabled) this.startAmbientSounds(); else this.stopAmbientSounds();
  },

  // Simple UI SFX using WebAudio oscillators
  playTone({ frequency = 440, durationMs = 120, type = 'sine', gain = 0.15 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gainNode);
    gainNode.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  },

  playSweep({ startFreq = 1200, endFreq = 400, durationMs = 120, type = 'square', gain = 0.15 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, startFreq), ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), ctx.currentTime + durationMs / 1000);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gainNode);
    gainNode.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  },

  ensureNoiseBuffer() {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const length = Math.max(1, Math.floor(0.5 * ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
    this.noiseBuffer = buffer;
    return buffer;
  },

  playNoiseBurst({ durationMs = 80, gain = 0.06, filterType = 'highpass', filterFreq = 1800, pan = 0, toAmbient = false }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    const target = toAmbient ? (this.ambientGain || this.masterGain) : (this.sfxGain || (() => { this.sfxGain = ctx.createGain(); this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime); this.sfxGain.connect(this.masterGain); return this.sfxGain; })());
    const src = ctx.createBufferSource();
    src.buffer = this.ensureNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    let output = g;
    try {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      output = panner;
      g.connect(panner);
      output.connect(target);
    } catch {
      g.connect(target);
    }
    src.connect(filter);
    filter.connect(g);
    src.start();
    src.stop(ctx.currentTime + durationMs / 1000);
  },

  playSweep({ startFreq = 800, endFreq = 300, durationMs = 120, type = 'square', gain = 0.15 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, startFreq), ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), ctx.currentTime + durationMs / 1000);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gainNode);
    gainNode.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  },

  ensureNoiseBuffer() {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const bufferSize = Math.max(1, Math.floor(0.5 * ctx.sampleRate));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.7;
    }
    this.noiseBuffer = buffer;
    return buffer;
  },

  playNoise({ durationMs = 120, gain = 0.05, filterType = 'highpass', filterFreq = 1200 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    if (!this.sfxGain) {
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.15, ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.ensureNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    src.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.sfxGain);
    src.start();
    src.stop(ctx.currentTime + durationMs / 1000);
  },

  playClick() { this.playUIClick(); },
  playUIClick() {
    // Prefer sample if allowed and available; otherwise clicky synth
    if (this.useSampleSfx && this.uiClickAudio) {
      try { const a = this.uiClickAudio.cloneNode(true); a.volume = this.uiClickVolume; a.play(); return; } catch {}
    }
    this.playNoiseBurst({ durationMs: 40, gain: 0.05, filterType: 'highpass', filterFreq: 2400 });
    this.playTone({ frequency: 1500, durationMs: 70, type: 'square', gain: 0.14 });
  },
  setSfxVolume(volume) {
    const v = clamp(volume, 0, 1);
    if (this.sfxGain && this.context) this.sfxGain.gain.setValueAtTime(v, this.context.currentTime);
    this.uiClickVolume = v;
    this.uiHoverVolume = v * 0.9;
    this.goldPickupVolume = Math.min(1, v * 1.1);
  },
  setMasterVolume(volume) {
    const v = clamp(volume, 0, 1);
    const ctx = this.ensureContext();
    if (!this.masterGain && ctx) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
      // Reconnect existing chains through master
      if (this.ambientGain) { try { this.ambientGain.disconnect(); } catch {} this.ambientGain.connect(this.masterGain); }
      if (this.sfxGain) { try { this.sfxGain.disconnect(); } catch {} this.sfxGain.connect(this.masterGain); }
    }
    if (this.masterGain && this.context) this.masterGain.gain.setValueAtTime(v, this.context.currentTime);
  },
  // Hover sample support
  async loadUIHoverSound(customUrl) {
    const urls = customUrl ? [customUrl] : [
      'assets/btn-hover.wav', './assets/btn-hover.wav',
      'assets/btn-hover.mp3', './assets/btn-hover.mp3',
      'assets/btn-hover.ogg', './assets/btn-hover.ogg'
    ];
    for (const url of urls) {
      try {
        const a = new Audio(url);
        a.volume = this.uiHoverVolume;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('UI hover load timeout')), 8000);
          a.addEventListener('canplaythrough', () => { clearTimeout(timeout); resolve(); }, { once: true });
          a.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('audio error')); }, { once: true });
          a.load();
        });
        this.uiHoverAudio = a;
        return true;
      } catch (e) {
        this.uiHoverAudio = null;
        continue;
      }
    }
    return false;
  },
  setUIHoverVolume(volume) {
    this.uiHoverVolume = clamp(volume, 0, 1);
    if (this.uiHoverAudio) this.uiHoverAudio.volume = this.uiHoverVolume;
  },
  setUIHoverSound(url) { return this.loadUIHoverSound(url); },
  playButtonHover() {
    if (this.useSampleSfx && this.uiHoverAudio) {
      try { const a = this.uiHoverAudio.cloneNode(true); a.volume = this.uiHoverVolume; a.play(); return; } catch {}
    }
    this.playNoiseBurst({ durationMs: 30, gain: 0.035, filterType: 'highpass', filterFreq: 2600 });
    this.playTone({ frequency: 1150, durationMs: 55, type: 'triangle', gain: 0.1 });
  },
  playButtonClick() { this.playUIClick(); },
  playClickDeep() { this.playUIClick(); },
  playClickSoft() { this.playUIClick(); },
  playClickHi() { this.playUIClick(); },
  playTab() { this.playNoiseBurst({ durationMs: 30, gain: 0.035, filterType: 'highpass', filterFreq: 2500 }); this.playTone({ frequency: 1300, durationMs: 60, type: 'triangle', gain: 0.12 }); },
  playConfirm() { this.playSweep({ startFreq: 700, endFreq: 1400, durationMs: 120, type: 'triangle', gain: 0.14 }); this.playNoiseBurst({ durationMs: 40, gain: 0.03, filterType: 'highpass', filterFreq: 2500 }); },
  playCancel() { this.playSweep({ startFreq: 400, endFreq: 220, durationMs: 110, type: 'sawtooth', gain: 0.12 }); this.playNoiseBurst({ durationMs: 35, gain: 0.03, filterType: 'highpass', filterFreq: 2200 }); },
  playPickup() { this.playNoiseBurst({ durationMs: 35, gain: 0.035, filterType: 'highpass', filterFreq: 2300 }); this.playTone({ frequency: 900, durationMs: 70, type: 'square', gain: 0.12 }); },
  playDrop() { this.playNoiseBurst({ durationMs: 45, gain: 0.045, filterType: 'highpass', filterFreq: 2000 }); this.playSweep({ startFreq: 500, endFreq: 180, durationMs: 150, type: 'sawtooth', gain: 0.12 }); },
  playDelete() { this.playNoiseBurst({ durationMs: 40, gain: 0.045, filterType: 'highpass', filterFreq: 2300 }); this.playTone({ frequency: 300, durationMs: 70, type: 'sine', gain: 0.12 }); setTimeout(() => this.playTone({ frequency: 240, durationMs: 90, type: 'sine', gain: 0.1 }), 60); },
  playEquip() { this.playNoiseBurst({ durationMs: 30, gain: 0.03, filterType: 'highpass', filterFreq: 2600 }); this.playTone({ frequency: 900, durationMs: 70, type: 'triangle', gain: 0.12 }); setTimeout(() => this.playTone({ frequency: 1200, durationMs: 70, type: 'triangle', gain: 0.12 }), 60); setTimeout(() => this.playTone({ frequency: 1500, durationMs: 90, type: 'triangle', gain: 0.12 }), 120); },

  // Soft "add to bag" sfx: two gentle pops
  playSoftBag() {
    const now = (this.ensureContext() || {}).currentTime;
    if (now == null) return;
    this.playTone({ frequency: 700, durationMs: 70, type: 'square', gain: 0.12 });
    setTimeout(() => this.playTone({ frequency: 950, durationMs: 70, type: 'square', gain: 0.1 }), 70);
  },

  // Chat notification sound: gentle notification beep
  playChatNotification() {
    const now = (this.ensureContext() || {}).currentTime;
    if (now == null) return;
    this.playTone({ frequency: 800, durationMs: 100, type: 'sine', gain: 0.08 });
    setTimeout(() => this.playTone({ frequency: 1000, durationMs: 80, type: 'sine', gain: 0.06 }), 110);
  },

  // Gold pickup sample loader/player
  async loadGoldPickupSound(customUrl) {
    const urls = customUrl ? [customUrl] : [
      'assets/gold-pickup.wav', './assets/gold-pickup.wav',
      'assets/gold-pickup.mp3', './assets/gold-pickup.mp3',
      'assets/gold-pickup.ogg', './assets/gold-pickup.ogg'
    ];
    for (const url of urls) {
      try {
        const a = new Audio(url);
        a.volume = this.goldPickupVolume;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('gold pickup load timeout')), 8000);
          a.addEventListener('canplaythrough', () => { clearTimeout(timeout); resolve(); }, { once: true });
          a.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('audio error')); }, { once: true });
          a.load();
        });
        this.goldPickupAudio = a;
        return true;
      } catch (e) {
        this.goldPickupAudio = null;
        continue;
      }
    }
    return false;
  },
  setGoldPickupVolume(volume) {
    this.goldPickupVolume = clamp(volume, 0, 1);
    if (this.goldPickupAudio) this.goldPickupAudio.volume = this.goldPickupVolume;
  },
  setGoldPickupSound(url) { return this.loadGoldPickupSound(url); },
  playGoldPickup() {
    if (this.useSampleSfx && this.goldPickupAudio) {
      try { const a = this.goldPickupAudio.cloneNode(true); a.volume = this.goldPickupVolume; a.play(); return; } catch {}
    }
    // Coin arpeggio
    this.playTone({ frequency: 1200, durationMs: 60, type: 'triangle', gain: 0.18 });
    setTimeout(() => this.playTone({ frequency: 1600, durationMs: 60, type: 'triangle', gain: 0.18 }), 60);
    setTimeout(() => this.playTone({ frequency: 2000, durationMs: 80, type: 'triangle', gain: 0.18 }), 120);
    setTimeout(() => this.playTone({ frequency: 2600, durationMs: 90, type: 'sine', gain: 0.16 }), 180);
  },

  async loadPickupSoundForKey(key, customUrl) {
    const urls = customUrl ? [customUrl] : [
      `assets/pickup-${key}.wav`, `./assets/pickup-${key}.wav`,
      `assets/pickup-${key}.mp3`, `./assets/pickup-${key}.mp3`,
      `assets/pickup-${key}.ogg`, `./assets/pickup-${key}.ogg`
    ];
    for (const url of urls) {
      try {
        const a = new Audio(url);
        a.volume = this.pickupVolume;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('pickup load timeout')), 8000);
          a.addEventListener('canplaythrough', () => { clearTimeout(timeout); resolve(); }, { once: true });
          a.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('audio error')); }, { once: true });
          a.load();
        });
        this.pickupCache.set(key, { audio: a, volume: this.pickupVolume });
        return true;
      } catch (e) {
        continue;
      }
    }
    return false;
  },

  setPickupVolume(volume) {
    this.pickupVolume = clamp(volume, 0, 1);
    // Update cached audios' volume baseline
    this.pickupCache.forEach((v) => { if (v && v.audio) v.audio.volume = this.pickupVolume; });
  },

  setPickupSound(key, url) { return this.loadPickupSoundForKey(key, url); },

  playPickupKey(key) {
    // Try cached sample if allowed
    if (this.useSampleSfx) {
      try {
        const cached = this.pickupCache.get(key);
        if (cached && cached.audio) {
          const a = cached.audio.cloneNode(true);
          a.volume = this.pickupVolume;
          a.play();
          return;
        }
        this.loadPickupSoundForKey(key).catch(() => {});
      } catch {}
    }
    // Synth variations
    const k = String(key || '').toLowerCase();
    if (k === 'wood') { this.playNoise({ durationMs: 80, gain: 0.06, filterType: 'lowpass', filterFreq: 900 }); setTimeout(() => this.playTone({ frequency: 320, durationMs: 60, type: 'square', gain: 0.1 }), 20); return; }
    if (k === 'shell') { this.playTone({ frequency: 1000, durationMs: 70, type: 'sine', gain: 0.14 }); setTimeout(() => this.playTone({ frequency: 1500, durationMs: 90, type: 'triangle', gain: 0.12 }), 60); return; }
    if (k === 'seaweed') { this.playNoise({ durationMs: 90, gain: 0.05, filterType: 'bandpass', filterFreq: 1400 }); return; }
    if (k === 'location') { this.playSweep({ startFreq: 500, endFreq: 1500, durationMs: 180, type: 'triangle', gain: 0.12 }); return; }
    if (k === 'fish') { this.playTone({ frequency: 900, durationMs: 70, type: 'square', gain: 0.12 }); setTimeout(() => this.playTone({ frequency: 600, durationMs: 70, type: 'square', gain: 0.1 }), 60); return; }
    this.playTone({ frequency: 800, durationMs: 80, type: 'square', gain: 0.12 });
  },

  playPickupFor({ name = '', category = '', subtype = '' } = {}) {
    const lower = String(name || '').toLowerCase();
    // Treasure/coins use dedicated gold pickup if available
    if (category === 'treasure' || lower.includes('coin')) { this.playGoldPickup(); return; }
    if (subtype === 'fishing_spot') { this.playPickupKey('fish'); return; }
    if (lower.includes('wood') || lower.includes('drift')) { this.playPickupKey('wood'); return; }
    if (lower.includes('shell')) { this.playPickupKey('shell'); return; }
    if (lower.includes('weed') || lower.includes('seaweed')) { this.playPickupKey('seaweed'); return; }
    if (category === 'location') { this.playPickupKey('location'); return; }
    this.playPickupKey('default');
  },
};


