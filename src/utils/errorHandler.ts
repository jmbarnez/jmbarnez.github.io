import { logger } from './logger';
import { CONFIG } from '../config/gameConfig';

// Extend Window interface for game objects
declare global {
  interface Window {
    Inventory?: {
      render?: () => void;
      debouncedRender?: () => void;
    };
    Equipment?: {
      updateUI?: () => void;
      debouncedUpdateUI?: () => void;
    };
  }
}

export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  gameState?: any;
  timestamp?: number;
  userAgent?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface GameError extends Error {
  code?: string;
  component?: string;
  operation?: string;
  context?: ErrorContext;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  recoverable?: boolean;
}

export class ErrorHandler {
  private static errorQueue: GameError[] = [];
  private static maxQueueSize = 100;
  private static retryAttempts = new Map<string, number>();
  private static maxRetries = 3;

  /**
   * Global error boundary - catches all unhandled errors
   */
  static initialize(): void {
    // Catch JavaScript errors
    window.addEventListener('error', (event) => {
      this.handleError(new Error(event.message), {
        component: 'global',
        operation: 'runtime',
        timestamp: Date.now()
      });
    });

    // Catch Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(event.reason), {
        component: 'global',
        operation: 'promise',
        timestamp: Date.now()
      });
    });

    logger.info('Error handler initialized');
  }

  /**
   * Main error handling method
   */
  static handleError(error: Error | GameError, context: ErrorContext = {}): void {
    const gameError = this.enrichError(error, context);
    
    // Log the error
    this.logError(gameError);
    
    // Add to error queue
    this.queueError(gameError);
    
    // Attempt recovery if possible
    if (gameError.recoverable !== false) {
      this.attemptRecovery(gameError);
    }
    
    // Show user notification if severity warrants it
    if (gameError.severity === 'high' || gameError.severity === 'critical') {
      this.showUserNotification(gameError);
    }
  }

  /**
   * Wraps functions with error handling
   */
  static wrap<T extends (...args: any[]) => any>(
    fn: T,
    context: ErrorContext = {}
  ): T {
    return ((...args: any[]) => {
      try {
        const result = fn(...args);
        
        // Handle async functions
        if (result instanceof Promise) {
          return result.catch((error) => {
            this.handleError(error, context);
            return this.getDefaultValue(context.operation);
          });
        }
        
        return result;
      } catch (error) {
        this.handleError(error as Error, context);
        return this.getDefaultValue(context.operation);
      }
    }) as T;
  }

  /**
   * Wraps async functions with error handling
   */
  static async wrapAsync<T>(
    fn: () => Promise<T>,
    context: ErrorContext = {}
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.handleError(error as Error, context);
      return null;
    }
  }

  /**
   * Safely executes a function with fallback
   */
  static safe<T>(
    fn: () => T,
    fallback: T,
    context: ErrorContext = {}
  ): T {
    try {
      return fn();
    } catch (error) {
      this.handleError(error as Error, { ...context, severity: 'low' });
      return fallback;
    }
  }

  /**
   * Retry mechanism for failed operations
   */
  static async retry<T>(
    fn: () => Promise<T>,
    context: ErrorContext = {},
    maxRetries: number = this.maxRetries
  ): Promise<T | null> {
    const operation = context.operation || 'unknown';
    const currentAttempts = this.retryAttempts.get(operation) || 0;
    
    try {
      const result = await fn();
      // Reset retry count on success
      this.retryAttempts.delete(operation);
      return result;
    } catch (error) {
      if (currentAttempts < maxRetries) {
        this.retryAttempts.set(operation, currentAttempts + 1);
        logger.warn(`Retrying operation ${operation}, attempt ${currentAttempts + 1}/${maxRetries}`);
        
        // Exponential backoff
        const delay = Math.pow(2, currentAttempts) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.retry(fn, context, maxRetries);
      } else {
        this.retryAttempts.delete(operation);
        this.handleError(error as Error, { ...context, severity: 'high' });
        return null;
      }
    }
  }

  /**
   * Validates and recovers game state
   */
  static validateGameState(gameState: any): boolean {
    try {
      // Basic validation
      if (!gameState || typeof gameState !== 'object') {
        throw new Error('Invalid game state: not an object');
      }

      // Check required properties
      const required = ['inventory', 'equipment', 'stats', 'skills'];
      for (const prop of required) {
        if (!(prop in gameState)) {
          throw new Error(`Invalid game state: missing ${prop}`);
        }
      }

      // Validate inventory
      if (!Array.isArray(gameState.inventory)) {
        gameState.inventory = new Array(24).fill(null);
        logger.warn('Fixed corrupted inventory');
      }

      // Validate equipment
      if (!gameState.equipment || typeof gameState.equipment !== 'object') {
        gameState.equipment = {
          helmet: null,
          chest: null,
          gloves: null,
          pants: null,
          shoes: null,
          ring1: null,
          ring2: null,
          amulet: null
        };
        logger.warn('Fixed corrupted equipment');
      }

      return true;
    } catch (error) {
      this.handleError(error as Error, {
        component: 'gameState',
        operation: 'validation',
        severity: 'critical'
      });
      return false;
    }
  }

  /**
   * Creates user-friendly error messages
   */
  static getUserMessage(error: GameError): string {
    const messages = {
      'save-failed': 'Could not save your progress. Your changes may be lost.',
      'load-failed': 'Could not load your saved game. Starting fresh.',
      'network-error': 'Connection problem. Please check your internet.',
      'inventory-full': 'Your inventory is full! Please make some space.',
      'invalid-item': 'This item appears to be corrupted and was removed.',
      'feature-unavailable': 'This feature is temporarily unavailable.'
    };

    return messages[error.code as keyof typeof messages] || 
           'Something went wrong, but the game should continue working.';
  }

  /**
   * Reports errors to analytics (if configured)
   */
  static reportError(error: GameError): void {
    if (!CONFIG.DEBUG.ERROR_REPORTING.ENABLED) return;

    try {
      // In a real app, this would send to analytics service
      const errorReport = {
        message: error.message,
        code: error.code,
        component: error.component,
        operation: error.operation,
        severity: error.severity,
        timestamp: error.context?.timestamp || Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      logger.debug('Error report', errorReport);
    } catch (reportError) {
      logger.error('Failed to report error', reportError);
    }
  }

  // Private methods
  private static enrichError(error: Error | GameError, context: ErrorContext): GameError {
    const gameError = error as GameError;
    gameError.component = context.component || gameError.component || 'unknown';
    gameError.operation = context.operation || gameError.operation || 'unknown';
    gameError.context = { ...context, timestamp: Date.now() };
    gameError.severity = gameError.severity || 'medium';
    gameError.recoverable = gameError.recoverable !== false;

    return gameError;
  }

  private static logError(error: GameError): void {
    const logLevel = {
      'low': 'warn',
      'medium': 'error',
      'high': 'error',
      'critical': 'error'
    }[error.severity || 'medium'] as 'warn' | 'error';

    logger[logLevel](`[${error.component}:${error.operation}] ${error.message}`, error);
  }

  private static queueError(error: GameError): void {
    this.errorQueue.push(error);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest error
    }
  }

  private static attemptRecovery(error: GameError): void {
    try {
      switch (error.component) {
        case 'inventory':
          this.recoverInventory();
          break;
        case 'equipment':
          this.recoverEquipment();
          break;
        case 'save':
          this.recoverSaveSystem();
          break;
        default:
          // Generic recovery
          break;
      }
    } catch (recoveryError) {
      logger.error('Recovery failed', recoveryError);
    }
  }

  private static recoverInventory(): void {
    try {
      const inventoryElement = document.getElementById('inv-grid');
      if (inventoryElement && typeof window.Inventory?.render === 'function') {
        window.Inventory.render();
        logger.info('Inventory recovered');
      }
    } catch (error) {
      logger.error('Inventory recovery failed', error);
    }
  }

  private static recoverEquipment(): void {
    try {
      if (typeof window.Equipment?.updateUI === 'function') {
        window.Equipment.updateUI();
        logger.info('Equipment recovered');
      }
    } catch (error) {
      logger.error('Equipment recovery failed', error);
    }
  }

  private static recoverSaveSystem(): void {
    try {
      // Attempt to reinitialize save system
      logger.info('Attempting save system recovery');
      // Could trigger a manual save attempt here
    } catch (error) {
      logger.error('Save system recovery failed', error);
    }
  }

  private static showUserNotification(error: GameError): void {
    try {
      const message = this.getUserMessage(error);
      const statusElement = document.getElementById('status');
      
      if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = '#ff6b6b'; // Error color
        
        // Reset color after 5 seconds
        setTimeout(() => {
          statusElement.style.color = '';
        }, 5000);
      }
      
      // Also log to console for developers
      console.warn('Game Error:', message);
    } catch (notificationError) {
      logger.error('Failed to show user notification', notificationError);
    }
  }

  private static getDefaultValue(operation?: string): any {
    const defaults: Record<string, any> = {
      'render': undefined,
      'save': false,
      'load': null,
      'addItem': false,
      'removeItem': false
    };

    return defaults[operation || 'unknown'] || null;
  }

  // Public getters for debugging
  static getErrorQueue(): GameError[] {
    return [...this.errorQueue];
  }

  static getRetryAttempts(): Map<string, number> {
    return new Map(this.retryAttempts);
  }
}

// Export convenience functions
export const handleError = ErrorHandler.handleError.bind(ErrorHandler);
export const wrapSafe = ErrorHandler.wrap.bind(ErrorHandler);
export const wrapAsync = ErrorHandler.wrapAsync.bind(ErrorHandler);
export const safe = ErrorHandler.safe.bind(ErrorHandler);
export const retry = ErrorHandler.retry.bind(ErrorHandler);
export const validateGameState = ErrorHandler.validateGameState.bind(ErrorHandler);
