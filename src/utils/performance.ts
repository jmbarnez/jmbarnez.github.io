import { CONFIG } from '../config/gameConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Performance utilities for optimizing game operations
 */

// Debounce utility (improved version)
export function debounce<T extends (...args: any[]) => void>(
  func: T, 
  wait: number, 
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  let result: any;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) result = func(...args);
    };

    const callNow = immediate && !timeout;
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = window.setTimeout(later, wait);
    
    if (callNow) result = func(...args);
    
    return result;
  };
}

// Throttle utility for high-frequency events
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Request Animation Frame batching
class RafBatcher {
  private callbacks: Array<() => void> = [];
  private rafId: number | null = null;

  add(callback: () => void) {
    this.callbacks.push(callback);
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }

  private flush() {
    const callbacks = this.callbacks.slice();
    this.callbacks.length = 0;
    this.rafId = null;
    
    callbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        logger.error('Error in RAF batch callback:', error);
      }
    });
  }
}

export const rafBatcher = new RafBatcher();

// DOM update batching
export function batchDomUpdates(updates: Array<() => void>) {
  rafBatcher.add(() => {
    updates.forEach(update => {
      try {
        update();
      } catch (error) {
        logger.error('Error in DOM update batch:', error);
      }
    });
  });
}

// Memory management utilities
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (item: T) => void;

  constructor(createFn: () => T, resetFn: (item: T) => void, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(item: T) {
    try {
      this.resetFn(item);
      this.pool.push(item);
    } catch (error) {
      logger.warn('Error resetting pooled object:', error);
    }
  }

  clear() {
    this.pool.length = 0;
  }
}

// Element pool for DOM elements
export const elementPool = new ObjectPool(
  () => document.createElement('div'),
  (div) => {
    div.className = '';
    div.innerHTML = '';
    div.removeAttribute('style');
    div.removeAttribute('data-index');
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }
);

// Intersection Observer for lazy loading
export class LazyLoader {
  private observer: IntersectionObserver;
  private callbacks = new Map<Element, () => void>();

  constructor(options: IntersectionObserverInit = {}) {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const callback = this.callbacks.get(entry.target);
          if (callback) {
            callback();
            this.unobserve(entry.target);
          }
        }
      });
    }, {
      rootMargin: '50px',
      threshold: 0.1,
      ...options
    });
  }

  observe(element: Element, callback: () => void) {
    this.callbacks.set(element, callback);
    this.observer.observe(element);
  }

  unobserve(element: Element) {
    this.callbacks.delete(element);
    this.observer.unobserve(element);
  }

  disconnect() {
    this.observer.disconnect();
    this.callbacks.clear();
  }
}

export const lazyLoader = new LazyLoader();

// Performance monitoring
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();

  time(label: string) {
    if (CONFIG.DEBUG.PERFORMANCE_MONITORING) {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (CONFIG.DEBUG.PERFORMANCE_MONITORING) {
      console.timeEnd(label);
    }
  }

  mark(label: string, value: number) {
    if (!CONFIG.DEBUG.PERFORMANCE_MONITORING) return;
    
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    
    const values = this.metrics.get(label)!;
    values.push(value);
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }

  getAverage(label: string): number {
    const values = this.metrics.get(label);
    if (!values || values.length === 0) return 0;
    
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getStats(label: string) {
    const values = this.metrics.get(label);
    if (!values || values.length === 0) {
      return { count: 0, average: 0, min: 0, max: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      average: this.getAverage(label),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  logStats() {
    if (!CONFIG.DEBUG.PERFORMANCE_MONITORING) return;
    
    console.group('Performance Stats');
    for (const [label, _] of this.metrics) {
      const stats = this.getStats(label);
      console.log(`${label}:`, stats);
    }
    console.groupEnd();
  }
}

export const perfMonitor = new PerformanceMonitor();

// FPS counter
export class FPSCounter {
  private frames: number[] = [];
  private lastTime = performance.now();
  private rafId: number | null = null;
  private callback: ((fps: number) => void) | null = null;

  start(callback?: (fps: number) => void) {
    if (!CONFIG.DEBUG.SHOW_FPS && !callback) return;
    
    this.callback = callback || null;
    this.tick();
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick() {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    
    this.frames.push(1000 / delta);
    if (this.frames.length > 60) {
      this.frames.shift();
    }
    
    const fps = this.frames.reduce((sum, f) => sum + f, 0) / this.frames.length;
    
    if (this.callback) {
      this.callback(Math.round(fps));
    }
    
    if (CONFIG.DEBUG.SHOW_FPS && this.frames.length % 60 === 0) {
      logger.debug(`FPS: ${Math.round(fps)}`);
    }
    
    this.rafId = requestAnimationFrame(() => this.tick());
  }
}

export const fpsCounter = new FPSCounter();

// Memory usage monitoring
export function getMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576) // MB
    };
  }
  return null;
}

// Cleanup utilities
export function cleanupEventListeners(element: Element) {
  const clone = element.cloneNode(true);
  element.parentNode?.replaceChild(clone, element);
  return clone;
}

// Efficient array operations
export function binarySearch<T>(
  array: T[], 
  target: T, 
  compareFn: (a: T, b: T) => number
): number {
  let left = 0;
  let right = array.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midValue = array[mid];
    if (midValue === undefined) break;
    
    const comparison = compareFn(midValue, target);
    
    if (comparison === 0) return mid;
    if (comparison < 0) left = mid + 1;
    else right = mid - 1;
  }
  
  return -1;
}

export function insertSorted<T>(
  array: T[], 
  item: T, 
  compareFn: (a: T, b: T) => number
): void {
  let left = 0;
  let right = array.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midValue = array[mid];
    if (midValue === undefined) break;
    
    if (compareFn(midValue, item) < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  array.splice(left, 0, item);
}
