import type { 
  GameState, 
  Settings, 
  LocationsData, 
  SaveResponse 
} from '../types/gameTypes.js';
import { CONFIG } from '../config/gameConfig.js';
import { logger } from '../utils/logger.js';

export const SETTINGS: Settings = { 
  highDiscoveryTest: true 
};

export const gameState: GameState = {
  stats: { 
    hp: CONFIG.BALANCE.STATS.STARTING_HP, 
    hpMax: CONFIG.BALANCE.STATS.STARTING_HP, 
    stamina: CONFIG.BALANCE.STATS.STARTING_STAMINA, 
    staminaMax: CONFIG.BALANCE.STATS.STARTING_STAMINA, 
    mana: CONFIG.BALANCE.STATS.STARTING_MANA, 
    manaMax: CONFIG.BALANCE.STATS.STARTING_MANA 
  },
  fishing: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT },
  exploration: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT },
  combat: {
    attack: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT },
    strength: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT },
    defense: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT }
  },
  foraging: { level: 1, xp: 0, xpToNext: CONFIG.BALANCE.XP.BASE_XP_TO_NEXT },
  inventory: [
    { name: 'Leather Helmet', count: 1, type: 'helmet' },
    { name: 'Leather Chest', count: 1, type: 'chest' },
    { name: 'Leather Gloves', count: 1, type: 'gloves' },
    { name: 'Leather Pants', count: 1, type: 'pants' },
    { name: 'Leather Boots', count: 1, type: 'shoes' },
    { name: 'Fishing Pole', count: 1 }
  ],
  equipment: { 
    helmet: null, 
    chest: null, 
    gloves: null, 
    pants: null, 
    shoes: null, 
    ring1: null, 
    ring2: null, 
    amulet: null 
  },
  invCapacity: CONFIG.BALANCE.INVENTORY.DEFAULT_CAPACITY,
  coins: 50,
  isFishing: false,
  isExploring: false,
  discoveredFishingSpot: false,
  activeView: 'explore',
  discoveries: []
};

export const Locations: LocationsData = {
  current: { 
    key: 'beach', 
    name: CONFIG.LOCATIONS.ZONES.beach.name, 
    icon: CONFIG.LOCATIONS.ZONES.beach.icon 
  },
  all: {
    beach: { 
      key: 'beach', 
      name: CONFIG.LOCATIONS.ZONES.beach.name, 
      icon: CONFIG.LOCATIONS.ZONES.beach.icon, 
      badgeClass: CONFIG.LOCATIONS.ZONES.beach.badgeClass, 
      bgClass: CONFIG.LOCATIONS.ZONES.beach.bgClass 
    },
    forest: { 
      key: 'forest', 
      name: CONFIG.LOCATIONS.ZONES.forest.name, 
      icon: CONFIG.LOCATIONS.ZONES.forest.icon, 
      badgeClass: CONFIG.LOCATIONS.ZONES.forest.badgeClass, 
      bgClass: CONFIG.LOCATIONS.ZONES.forest.bgClass 
    }
  }
};

/**
 * Collects all game data that needs to be saved
 * @returns Complete save data object
 */
function collectCompleteGameData() {
  const saveData: any = {
    // Core game state
    gameState: { ...gameState },
    
    // User preferences
    gameTheme: localStorage.getItem('gameTheme') || 'light',
    
    // Discovered resources
    fishDiscovered: JSON.parse(localStorage.getItem('fish_discovered') || '[]'),
    
    // UI positions and settings
    panelPositions: {},
    zonePositions: {},
    
    // Ground items (discoveries)
    groundItems: gameState.discoveries || [],
    
    // Idle state
    idleState: null,
    
    // Timestamp
    _savedAt: new Date().toISOString()
  };

  // Collect panel positions
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('panel-pos:')) {
      try {
        const panelId = key.replace('panel-pos:', '');
        saveData.panelPositions[panelId] = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {}
    }
  }

  // Collect zone positions
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('zone_pos_')) {
      try {
        const zoneId = key.replace('zone_pos_', '');
        saveData.zonePositions[zoneId] = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {}
    }
  }

  // Get idle state if available
  try {
    const idleData = localStorage.getItem('sandboxIdleState');
    if (idleData) {
      saveData.idleState = JSON.parse(idleData);
    }
  } catch {}

  return saveData;
}

/**
 * Restores all game data from saved state
 * @param saveData Complete save data object
 */
function restoreCompleteGameData(saveData: any) {
  try {
    // Restore core game state
    if (saveData.gameState) {
      Object.assign(gameState, saveData.gameState);
    }

    // Restore user preferences
    if (saveData.gameTheme) {
      localStorage.setItem('gameTheme', saveData.gameTheme);
    }

    // Restore discovered fish
    if (saveData.fishDiscovered) {
      localStorage.setItem('fish_discovered', JSON.stringify(saveData.fishDiscovered));
    }

    // Restore panel positions
    if (saveData.panelPositions) {
      Object.entries(saveData.panelPositions).forEach(([panelId, position]) => {
        localStorage.setItem(`panel-pos:${panelId}`, JSON.stringify(position));
      });
    }

    // Restore zone positions
    if (saveData.zonePositions) {
      Object.entries(saveData.zonePositions).forEach(([zoneId, position]) => {
        localStorage.setItem(`zone_pos_${zoneId}`, JSON.stringify(position));
      });
    }

    // Restore idle state
    if (saveData.idleState) {
      localStorage.setItem('sandboxIdleState', JSON.stringify(saveData.idleState));
    }

    // Restore ground items
    if (saveData.groundItems && Array.isArray(saveData.groundItems)) {
      gameState.discoveries = saveData.groundItems;
    }

    logger.saveOperation('Complete game data restored successfully');
  } catch (error) {
    logger.error('Failed to restore some game data', error);
  }
}
/**
 * Loads complete game state from the server
 * @returns Promise<boolean> - True if state was loaded successfully
 */
export async function loadSavedState(): Promise<boolean> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      logger.info('No auth token, using default state');
      return false;
    }

    logger.apiCall(CONFIG.API.ENDPOINTS.SAVE, 'GET');
    const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.SAVE}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data: SaveResponse = await response.json();
      if (data?.save) {
        // Restore complete game data
        restoreCompleteGameData(data.save);
        logger.saveOperation('Complete game state loaded from server successfully');
        return true;
      }
    }
    
    logger.info('No saved data found on server, using default state');
    return false;
  } catch (error) {
    logger.error('Failed to load saved state from server', error);
    return false;
  }
}

/**
 * Saves complete game state to the server
 * @returns Promise<boolean> - True if state was saved successfully
 */
export async function saveGameState(): Promise<boolean> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      logger.warn('No auth token, cannot save to server');
      return false;
    }

    // Collect all game data
    const completeGameData = collectCompleteGameData();
    
    logger.apiCall(CONFIG.API.ENDPOINTS.SAVE, 'POST');
    const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.SAVE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ save: completeGameData })
    });

    if (response.ok) {
      logger.saveOperation('Complete game state saved to server successfully');
      return true;
    } else {
      logger.warn(`Failed to save to server: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('Failed to save complete game state to server', error);
    return false;
  }
}