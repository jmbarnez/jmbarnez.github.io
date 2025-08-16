// Performance utilities used across the app (debounce, throttle, RAF batching, element pool, simple perf monitor)
export function debounce(func, wait = 200, immediate = false) {
  let timeout = null;
  let result;
  return function executedFunction(...args) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) result = func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) result = func.apply(context, args);
    return result;
  };
}

export function throttle(func, limit = 100) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// RAF batcher and batchDomUpdates
class RafBatcher {
  constructor() {
    this.callbacks = [];
    this.rafId = null;
  }
  add(cb) {
    this.callbacks.push(cb);
    if (this.rafId === null) this.rafId = requestAnimationFrame(() => this.flush());
  }
  flush() {
    const cbs = this.callbacks.slice();
    this.callbacks.length = 0;
    this.rafId = null;
    for (const cb of cbs) {
      try { cb(); } catch (e) { /* swallow */ }
    }
  }
}

export const rafBatcher = new RafBatcher();

export function batchDomUpdates(updates = []) {
  rafBatcher.add(() => {
    for (const u of updates) {
      try { u(); } catch (e) { /* swallow */ }
    }
  });
}

// Simple object pool for DOM elements
export class ObjectPool {
  constructor(createFn, resetFn, initialSize = 10) {
    this.pool = [];
    this.createFn = createFn;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) this.pool.push(this.createFn());
  }
  get() { return this.pool.length ? this.pool.pop() : this.createFn(); }
  release(item) { try { this.resetFn(item); this.pool.push(item); } catch (e) {} }
  clear() { this.pool.length = 0; }
}

export const elementPool = new ObjectPool(
  () => document.createElement('div'),
  (div) => { div.className = ''; div.innerHTML = ''; div.removeAttribute('style'); div.removeAttribute('data-index'); if (div.parentNode) div.parentNode.removeChild(div); },
  20
);

// Minimal performance monitor
export class PerformanceMonitor {
  constructor() { this.enabled = false; this.metrics = new Map(); }
  time(label) { if (this.enabled) console.time(label); }
  timeEnd(label) { if (this.enabled) console.timeEnd(label); }
  mark(label, value) { if (!this.enabled) return; if (!this.metrics.has(label)) this.metrics.set(label, []); this.metrics.get(label).push(value); }
  timeWindow(label, fn) { const start = performance.now(); fn(); const dur = performance.now() - start; this.mark(label, dur); }
}

export const perfMonitor = new PerformanceMonitor();


