import { DEBUG_CONFIG } from '../config/gameConfig.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

class Logger {
  private currentLevel: number = DEBUG_CONFIG.DEFAULT_LOG_LEVEL;

  constructor() {
    // Set log level from config
    this.setLevel(DEBUG_CONFIG.DEFAULT_LOG_LEVEL);
  }

  setLevel(level: number) {
    this.currentLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!DEBUG_CONFIG.ENABLED) return level === 'error';
    return DEBUG_CONFIG.LOG_LEVELS[level.toUpperCase() as keyof typeof DEBUG_CONFIG.LOG_LEVELS] <= this.currentLevel;
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return data ? `${prefix} ${message}` : `${prefix} ${message}`;
  }

  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), error || '');
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), data || '');
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), data || '');
    }
  }

  debug(message: string, data?: any) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), data || '');
    }
  }

  // Performance monitoring helpers
  time(label: string) {
    if (DEBUG_CONFIG.PERFORMANCE_MONITORING && this.shouldLog('debug')) {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (DEBUG_CONFIG.PERFORMANCE_MONITORING && this.shouldLog('debug')) {
      console.timeEnd(label);
    }
  }

  // Game-specific logging helpers
  saveOperation(message: string, data?: any) {
    this.info(`[SAVE] ${message}`, data);
  }

  gameAction(action: string, details?: any) {
    this.debug(`[GAME] ${action}`, details);
  }

  apiCall(endpoint: string, method: string, status?: number) {
    const statusText = status ? ` (${status})` : '';
    this.debug(`[API] ${method} ${endpoint}${statusText}`);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing or multiple instances
export { Logger };
