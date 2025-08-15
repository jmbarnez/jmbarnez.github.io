// Centralized idle job scheduler. Keeps runtime-only job state (no persistence).

export class IdleManager {
  static jobsById = new Map();
  static running = false;
  static frameReq = 0;
  static lastTickAt = 0;
  static tickIntervalMs = 250;
  static accumulatorMs = 0;
  static priorities = { high: 0, normal: 1, low: 2 };

  static init() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const loop = () => {
      if (!this.running) return;
      try { this.tick(); } catch {}
      this.frameReq = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(loop) : setTimeout(loop, this.tickIntervalMs);
    };
    loop();
  }

  static tick() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dtMsRaw = now - this.lastTickAt;
    const dtMsClamped = Math.max(0, Math.min(1000, dtMsRaw || 0));
    this.lastTickAt = now;
    this.accumulatorMs += dtMsClamped;

    // Process in fixed quanta to stabilize simulation regardless of frame rate
    const stepMs = this.tickIntervalMs;
    const maxSteps = 5; // prevent spiral of death
    let steps = 0;
    while (this.accumulatorMs >= stepMs && steps < maxSteps) {
      this._processStep(stepMs);
      this.accumulatorMs -= stepMs;
      steps += 1;
    }
  }

  static _processStep(stepMs) {
    // Execute jobs grouped by priority; run high first, then normal, then low
    const groups = { 0: [], 1: [], 2: [] };
    for (const [id, job] of Array.from(this.jobsById.entries())) {
      if (!job || job.cancelled) { this.jobsById.delete(id); continue; }
      if (job.paused) continue;
      const p = this.priorities[job.priority] ?? 1;
      groups[p].push([id, job]);
    }
    for (const p of [0, 1, 2]) {
      const arr = groups[p];
      for (const [id, job] of arr) {
        try { job.tick(stepMs); } catch {}
        if (job.complete) {
          this.jobsById.delete(id);
          try { job.emit('complete'); } catch {}
        }
      }
    }
  }

  static addJob(job) {
    const id = job.id || `job_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    job.id = id;
    job.manager = this;
    if (!job.priority) job.priority = 'normal';
    this.jobsById.set(id, job);
    try { job.emit('added'); } catch {}
    return job;
  }

  static removeJob(id) {
    const job = this.jobsById.get(id);
    if (!job) return;
    job.cancelled = true;
    this.jobsById.delete(id);
    try { job.emit('removed'); } catch {}
  }

  static pauseJob(id, paused) {
    const job = this.jobsById.get(id);
    if (!job) return;
    job.paused = !!paused;
    try { job.emit('paused', !!paused); } catch {}
  }

  static hasActiveOfKind(kind) {
    for (const job of this.jobsById.values()) {
      if (job && !job.cancelled && !job.complete && job.kind === kind) return true;
    }
    return false;
  }

  static hasAnyActive() {
    for (const job of this.jobsById.values()) {
      if (job && !job.cancelled && !job.complete) return true;
    }
    return false;
  }

  static cancelAllOfKind(kind) {
    const toRemove = [];
    for (const [id, job] of this.jobsById.entries()) {
      if (job && !job.cancelled && !job.complete && job.kind === kind) toRemove.push(id);
    }
    toRemove.forEach((id) => this.removeJob(id));
  }
}

class IdleJobBase {
  constructor(kind) {
    this.kind = kind;
    this.id = '';
    this.paused = false;
    this.cancelled = false;
    this.complete = false;
    this.listeners = new Map();
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }
  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set.values())) {
      try { fn(...args); } catch {}
    }
  }
}

// Deterministic, rate-based fishing job. UI should listen for events to render.
export class FishingJob extends IdleJobBase {
  constructor(options) {
    super('fishing');
    const {
      remaining = 1,
      fishTypes = [],
      playerLevel = 1,
      rng = Math.random,
    } = options || {};
    this.remaining = Math.max(0, remaining | 0);
    this.fishTypes = Array.isArray(fishTypes) ? fishTypes.slice() : [];
    this.playerLevel = Math.max(1, playerLevel | 0);
    this.rng = rng;

    // Running state
    this.progress = 0; // 0..1 toward next catch
    this.currentFish = this.pickFish();
    this.emit('fishChanged', this.currentFish);
  }

  pickFish() {
    // Weighted random selection based on weight field
    if (!this.fishTypes || this.fishTypes.length === 0) return { name: 'Minnow', weight: 1, xp: 1 };
    const total = this.fishTypes.reduce((sum, f) => sum + (f.weight || 0), 0) || 1;
    let r = this.rng() * total;
    for (const f of this.fishTypes) {
      r -= (f.weight || 0);
      if (r <= 0) return f;
    }
    return this.fishTypes[0];
  }

  ratePerSecondForFish(fish) {
    // Base time-to-catch ≈ 8–12s depending on level and difficulty
    const baseRate = 0.10; // progress per second (1.0 == one catch)
    const maxWeight = Math.max(...this.fishTypes.map(f => f.weight || 1), 1);
    const difficulty = 1 - ((fish.weight || 1) / maxWeight); // 0 easy .. 1 hard
    const levelBonus = Math.min(0.30, (this.playerLevel - 1) * 0.03); // up to +30%
    const difficultyPenalty = difficulty * 0.40; // up to -40% for hardest
    const rate = baseRate * (1 + levelBonus) * (1 - difficultyPenalty);
    return Math.max(0.02, rate); // clamp a floor
  }

  tick(dtMs) {
    if (this.complete || this.cancelled || this.paused) return;
    if (this.remaining <= 0) { this.complete = true; return; }
    const dtSec = dtMs / 1000;
    const rate = this.ratePerSecondForFish(this.currentFish);
    this.progress += rate * dtSec;
    if (this.progress >= 1) {
      this.progress -= 1;
      const caught = this.currentFish;
      this.emit('catch', caught);
        try {
          const set = new Set(JSON.parse(localStorage.getItem('fish_discovered') || '[]'));
          set.add(String(caught?.name || ''));
          localStorage.setItem('fish_discovered', JSON.stringify(Array.from(set.values())));
          
          // Auto-save when fish discovered
          try {
            import('./SaveManager.js').then(({ SaveManager }) => {
              SaveManager.debouncedSave();
            });
          } catch {}
        } catch {}
      this.remaining -= 1;
      this.emit('remainingChanged', this.remaining);
      if (this.remaining <= 0) {
        this.complete = true;
        return;
      }
      this.currentFish = this.pickFish();
      this.emit('fishChanged', this.currentFish);
    }
    this.emit('progress', Math.max(0, Math.min(1, this.progress)));
  }
}


