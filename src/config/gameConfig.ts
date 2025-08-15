/**
 * Centralized Game Configuration
 * All game constants, balancing values, and settings in one place
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: (() => {
    // For production (Netlify) and development, use correct API base
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname;
      
      // For local development, always use port 8000 (Netlify dev server)
      if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return `${window.location.protocol}//${currentHost}:8889`;
      } else if (currentHost.includes('ngrok-free.app') || currentHost.includes('ngrok.app')) {
        return window.location.origin;
      } else {
        return window.location.origin;
      }
    }
    return ''; // Fallback for server-side
  })(),
  ENDPOINTS: {
    SAVE: '/api/save',
    AUTH: '/api/auth',
    CHAT: '/api/chat',
    MARKET: '/api/market'
  },
  TIMEOUTS: {
    REQUEST: 5000,      // 5 seconds
    SAVE: 10000         // 10 seconds for saves
  }
} as const;

// Save System Configuration  
export const SAVE_CONFIG = {
  AUTO_SAVE_INTERVAL: 30000,    // 30 seconds
  DEBOUNCE_DELAY: 2000,         // 2 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000             // 1 second
} as const;

// Game Balance Configuration
export const GAME_BALANCE = {
  // Experience and Leveling
  XP: {
    BASE_XP_TO_NEXT: 100,
    XP_MULTIPLIER: 1.2,         // Each level requires 20% more XP
    MAX_LEVEL: 99
  },
  
  // Player Stats
  STATS: {
    STARTING_HP: 100,
    STARTING_STAMINA: 100,
    STARTING_MANA: 100,
    HP_PER_LEVEL: 5,
    STAMINA_PER_LEVEL: 3,
    MANA_PER_LEVEL: 4
  },

  // Inventory
  INVENTORY: {
    DEFAULT_CAPACITY: 25,
    MAX_CAPACITY: 100,
    STACK_SIZE: 1000
  },

  // Exploration
  EXPLORATION: {
    BASE_EXPLORE_TIME: 3000,     // 3 seconds
    DISCOVERY_CHANCE: 0.15,      // 15% base chance
    RARE_DISCOVERY_CHANCE: 0.05, // 5% chance for rare items
    XP_PER_EXPLORATION: 10
  },

  // Fishing  
  FISHING: {
    BASE_CATCH_TIME: 2000,       // 2 seconds
    SUCCESS_CHANCE: 0.8,         // 80% base success rate
    RARE_FISH_CHANCE: 0.1,       // 10% chance for rare fish
    XP_PER_CATCH: 15
  },

  // Ground Items
  GROUND_ITEMS: {
    MAX_ITEMS: 50,               // Maximum items on ground
    CLEANUP_THRESHOLD: 40,       // Start cleanup at this many items
    DEFAULT_SPAWN_COUNT: 1,
    MULTI_SPAWN_CHANCE: 0.2      // 20% chance for multiple items
  }
} as const;

// UI Configuration
export const UI_CONFIG = {
  // Animation Timings
  ANIMATIONS: {
    FADE_DURATION: 300,
    SLIDE_DURATION: 250,
    PULSE_DURATION: 1000,
    DISCOVERY_CARD_DURATION: 500
  },

  // Panel Management
  PANELS: {
    DEFAULT_POSITIONS: {
      inventory: { x: 20, y: 100 },
      equipment: { x: 350, y: 100 },
      skills: { x: 680, y: 100 },
      chat: { x: 20, y: 400 },
      zones: { x: 350, y: 400 }
    },
    MIN_WIDTH: 200,
    MIN_HEIGHT: 150,
    DRAG_THRESHOLD: 5
  },

  // Notifications
  NOTIFICATIONS: {
    DURATION: 3000,              // 3 seconds
    MAX_VISIBLE: 5,
    FADE_OUT_DURATION: 500
  }
} as const;

// Audio Configuration
export const AUDIO_CONFIG = {
  DEFAULT_VOLUMES: {
    AMBIENCE: 0.08,              // 8%
    SFX: 0.15,                   // 15%
    MASTER: 1.0
  },
  FADE_DURATION: 500,
  MAX_SIMULTANEOUS_SFX: 5
} as const;

// Item System Configuration
export const ITEM_CONFIG = {
  ICONS: {
    DEFAULT: 'icon-shell',
    FALLBACK: 'icon-shell',
    EQUIPMENT_FALLBACK: 'icon-player'
  },
  
  EQUIPMENT_TYPES: [
    'helmet', 'chest', 'gloves', 'pants', 'shoes', 
    'ring1', 'ring2', 'amulet'
  ] as const,

  RARITY: {
    COMMON: { weight: 70, color: '#FFFFFF' },
    UNCOMMON: { weight: 20, color: '#00FF00' },
    RARE: { weight: 8, color: '#0080FF' },
    EPIC: { weight: 2, color: '#8000FF' }
  }
} as const;

// Development & Debug Configuration
export const DEBUG_CONFIG = {
  ENABLED: process.env.NODE_ENV === 'development',
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1, 
    INFO: 2,
    DEBUG: 3
  },
  DEFAULT_LOG_LEVEL: 2,         // INFO
  PERFORMANCE_MONITORING: true,
  SHOW_FPS: false,
  ERROR_REPORTING: {
    ENABLED: process.env.NODE_ENV === 'development',
    MAX_QUEUE_SIZE: 100,
    REPORT_ENDPOINT: '/api/errors'
  }
} as const;

// Location Configuration
export const LOCATION_CONFIG = {
  ZONES: {
    beach: {
      name: 'Serene Shores',
      icon: '🏖️',
      badgeClass: 'beach',
      bgClass: 'beach-vector',
      unlocked: true,
      ambientSound: 'beach-ambience.mp3'
    },
    forest: {
      name: 'Whispering Woods', 
      icon: '🌲',
      badgeClass: 'forest',
      bgClass: 'forest-vector',
      unlocked: false,
      ambientSound: 'tforest-ambience.mp3',
      unlockRequirement: { exploration: 5 }
    }
  }
} as const;

// Validation helpers
export function validateConfig() {
  const errors: string[] = [];
  
  // Validate XP progression makes sense
  if (GAME_BALANCE.XP.XP_MULTIPLIER <= 1) {
    errors.push('XP multiplier must be greater than 1');
  }
  
  // Validate inventory limits
  if (GAME_BALANCE.INVENTORY.DEFAULT_CAPACITY > GAME_BALANCE.INVENTORY.MAX_CAPACITY) {
    errors.push('Default inventory capacity cannot exceed maximum capacity');
  }
  
  // Validate probability values
  Object.entries(GAME_BALANCE).forEach(([category, values]) => {
    Object.entries(values as Record<string, any>).forEach(([key, value]) => {
      if (key.includes('CHANCE') && (value < 0 || value > 1)) {
        errors.push(`${category}.${key} must be between 0 and 1`);
      }
    });
  });
  
  if (errors.length > 0) {
    console.error('Configuration validation failed:', errors);
    return false;
  }
  
  console.log('Configuration validation passed');
  return true;
}

// Export combined config for easy access
export const CONFIG = {
  API: API_CONFIG,
  SAVE: SAVE_CONFIG,
  BALANCE: GAME_BALANCE,
  UI: UI_CONFIG,
  AUDIO: AUDIO_CONFIG,
  ITEMS: ITEM_CONFIG,
  DEBUG: DEBUG_CONFIG,
  LOCATIONS: LOCATION_CONFIG
} as const;

// Type exports for other modules
export type GameConfig = typeof CONFIG;
export type BalanceConfig = typeof GAME_BALANCE;
export type UIConfig = typeof UI_CONFIG;
