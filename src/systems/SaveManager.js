import { gameState, saveGameState } from '../state/gameState.js';
import { CONFIG } from '../config/gameConfig.js';
import { logger } from '../utils/logger.js';

let saveTimeout = null;
let isAutoSaveActive = false;

export const SaveManager = {
  // Debounced save function to avoid spamming the server
  debouncedSave() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      logger.saveOperation('Debounced save triggered');
      saveGameState();
    }, CONFIG.SAVE.DEBOUNCE_DELAY);
  },

  // Start automatic periodic saves
  startAutoSave() {
    if (isAutoSaveActive) return;
    
    isAutoSaveActive = true;
    const intervalMs = CONFIG.SAVE.AUTO_SAVE_INTERVAL || 30000;
    logger.info(`Auto-save enabled - saves complete game data every ${Math.round(intervalMs/1000)} seconds`);
    
    this._autoId = setInterval(async () => {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (token) {
        logger.saveOperation('Auto-save triggered');
        await saveGameState();
      }
    }, intervalMs);
  },

  // Stop automatic saves
  stopAutoSave() {
    if (this._autoId) {
      clearInterval(this._autoId);
      this._autoId = null;
    }
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    isAutoSaveActive = false;
  },

  // Manual save (for important moments like before closing)
  async saveNow() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (token) {
      return await saveGameState();
    }
    return false;
  },

  // Legacy methods for compatibility (now do nothing or minimal operations)
  listSlots() { return []; },
  getSlotInfo() { return null; },
  saveToSlot() { return this.saveNow(); },
  loadFromSlot() { return Promise.resolve(false); },
  deleteSlot() {},

  createDefaultState() {
    return {
      stats: { hp: 100, hpMax: 100, stamina: 100, staminaMax: 100, mana: 100, manaMax: 100 },
      fishing: { level: 1, xp: 0, xpToNext: 100 },
      exploration: { level: 1, xp: 0, xpToNext: 100 },
      combat: {
        attack: { level: 1, xp: 0, xpToNext: 100 },
        strength: { level: 1, xp: 0, xpToNext: 100 },
        defense: { level: 1, xp: 0, xpToNext: 100 }
      },
      foraging: { level: 1, xp: 0, xpToNext: 100 },
      inventory: [
        { name: 'Leather Helmet', count: 1, type: 'helmet' },
        { name: 'Leather Chest', count: 1, type: 'chest' },
        { name: 'Leather Gloves', count: 1, type: 'gloves' },
        { name: 'Leather Pants', count: 1, type: 'pants' },
        { name: 'Leather Boots', count: 1, type: 'shoes' },
        { name: 'Fishing Pole', count: 1, type: 'tool' }
      ],
      equipment: { helmet: null, chest: null, gloves: null, pants: null, shoes: null, ring1: null, ring2: null, amulet: null },
      invCapacity: 25,
      coins: 0,
      isFishing: false,
      isExploring: false,
      discoveredFishingSpot: false,
      activeView: 'explore',
      discoveries: []
    };
  },

  async newGame() {
    // Reset to default state
    const fresh = this.createDefaultState();
    Object.assign(gameState, fresh);
    
    // Save the fresh state to server
    await this.saveNow();
    
    // Clear any local data that might interfere
    try {
      localStorage.removeItem('sandboxIdleState');
      localStorage.removeItem('fish_discovered');
      // Remove any saved zone positions
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('zone_pos_')) localStorage.removeItem(k);
      }
    } catch {}
    
    window.location.reload();
  },
};


