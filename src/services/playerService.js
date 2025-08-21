import { getPlayerInventory, setPlayerInventory, updatePlayerAreaState } from './firestoreService.js';
import { get, ref } from 'firebase/database';
import { database } from '../utils/firebaseClient.js';
import { gameState } from '../app/state.js';
import { renderInventory } from '../ui/inventory.js';
import { inventoryManager } from '../game/inventoryManager.js';
import { multiplayerManager } from '../game/multiplayerManager.js';
import { subscribeAreaPlayers } from './realtimePosition.js';
import { game } from '../game/core.js';
import { showPlayerTyping, hidePlayerBubble, showPlayerMessage, removePlayerBubble } from '../game/character.js';
import { worldToScreenCoords } from '../utils/math.js';
import { experienceManager } from '../game/experienceManager.js';

// AI: Increased save interval to reduce Firebase Realtime Database write operations for player position.
// Clients are expected to interpolate player movement for smoothness between server updates.
const SAVE_INTERVAL = 5000; // 5 seconds

class PlayerService {
  constructor() {
    this.uid = null;
    this.areaState = {
      areaId: 'beach',
      x: null, // AI: Let game center the player initially
      y: null, // AI: Let game center the player initially  
      action: null,
    };
    this.saveIntervalId = null;
    this.lastSavedState = null;
    this._initialized = false;
  }

  /**
   * Initializes the service with the player's UID and starts the save loop.
   * @param {string} uid - The player's user ID.
   */
  initialize(uid) {
    if (!uid) {
      console.error('PlayerService.initialize requires a UID.');
      return;
    }
    // Guard against HMR/double init in dev
    if (this._initialized && this.uid === uid && this.saveIntervalId) {
      return;
    }
    this.uid = uid;
    experienceManager.initialize(uid); // AI: Initialize the experience manager with the UID.
    if (this.saveIntervalId) {
      try { clearInterval(this.saveIntervalId); } catch (_) {}
      this.saveIntervalId = null;
    }
    this.saveIntervalId = setInterval(() => this.saveState(), SAVE_INTERVAL);
    this._initialized = true;
  }

  /**
   * Stops the periodic save loop.
   */
  stop() {
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      this.saveIntervalId = null;
    }
  }

  /**
   * Updates the in-memory player state by merging the new state.
   * @param {object} newState - The partial or full state to update.
   */
  updateState(newState) {
    this.areaState = { ...this.areaState, ...newState };
  }

  /**
   * Saves the player's state to Firestore and localStorage if it has changed.
   * @private
   */
  async saveState() {
    if (!this.uid) return;

    const currentStateString = JSON.stringify(this.areaState);
    if (currentStateString === this.lastSavedState) {
      // console.log('[PlayerService] State unchanged, skipping save.');
      return; // State has not changed, no need to save.
    }
    // State has changed, persist it.
    await this._persist(currentStateString);
  }

  // Force an immediate save regardless of state comparison
  async saveNow() {
    if (!this.uid) return;
    const currentStateString = JSON.stringify(this.areaState);
    await this._persist(currentStateString);
  }

  async _persist(currentStateString) {
    try {
      // Prepare payload for RTDB (players/{uid}) - only save if we have valid coordinates
      if (typeof this.areaState.x !== 'number' || typeof this.areaState.y !== 'number') {
        return;
      }

      const payload = {
        areaId: this.areaState.areaId,
        ax: Math.round(this.areaState.x),
        ay: Math.round(this.areaState.y),
        action: this.areaState.action,
        lastSaved: Date.now(),
      };
      if (typeof this.areaState.axn === 'number') payload.axn = this.areaState.axn;
      if (typeof this.areaState.ayn === 'number') payload.ayn = this.areaState.ayn;

      // AI: Save directly to Firebase only
      await updatePlayerAreaState(this.uid, payload);

      this.lastSavedState = currentStateString;
    } catch (error) {
      console.error('[PlayerService] Failed to save player state to Firebase:', error);
    }
  }

  /**
   * Retrieves the initial position from Firebase only.
   * @returns {Promise<{areaId: string, x: number, y: number}|null>}
   */
  async getInitialPosition() {
    if (!this.uid) return null;

    // AI: Load both inventory and experience data during initialization
    await this.loadInventory();
    await this.loadExperience();

    // AI: Load position from Firebase only
    try {
      const snap = await get(ref(database, `players/${this.uid}`));
      if (snap.exists()) {
        const remoteData = snap.val();
        if (remoteData && remoteData.areaId) {
          let rx, ry;
          if (typeof remoteData.ax === 'number' && typeof remoteData.ay === 'number') {
            rx = remoteData.ax;
            ry = remoteData.ay;
          } else if (typeof remoteData.x === 'number' && typeof remoteData.y === 'number') {
            rx = remoteData.x;
            ry = remoteData.y;
          }
          if (typeof rx === 'number' && typeof ry === 'number') {
            const position = { areaId: remoteData.areaId, x: rx, y: ry };
            this.updateState(position);
            return position;
          } else {
            console.warn('[PlayerService] No valid position coordinates found in Firebase data', remoteData);
          }
        } else {
          console.warn('[PlayerService] No areaId found in Firebase data', remoteData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch initial position from Firebase:', error);
    }
    return null;
  }

  async loadInventory() {
    if (!this.uid) return;

    let currentInventory = await getPlayerInventory(this.uid);

    // Ensure currentInventory is always an array. If it's null, undefined, or not an array,
    // initialize it as an empty array.
    if (!Array.isArray(currentInventory)) {
      currentInventory = Array(24).fill(null);
      await setPlayerInventory(this.uid, currentInventory); // Persist the new empty array
    } else {
      // Ensure the inventory has exactly 24 slots, padding with null if necessary.
      if (currentInventory.length < 24) {
        while (currentInventory.length < 24) {
          currentInventory.push(null);
        }
        await setPlayerInventory(this.uid, currentInventory);
      } else if (currentInventory.length > 24) {
        currentInventory = currentInventory.slice(0, 24);
        await setPlayerInventory(this.uid, currentInventory);
      }
    }

    // AI: Initialize inventory manager with loaded data
    inventoryManager.initialize(currentInventory);
    // Update the global game state for backward compatibility
    gameState.playerInventory = currentInventory;
    renderInventory();
  }

  /**
   * AI: Load player experience data from server
   */
  async loadExperience() {
    if (!this.uid) return;
    
    try {
      // AI: Load experience data from server
      await experienceManager.loadFromServer(this.uid);
    } catch (error) {
      console.error('Failed to load player experience:', error);
    }
  }

  /**
   * AI: Deprecated - multiplayer updates now handled by multiplayerManager
   * Kept for backward compatibility during transition
   */
  subscribeToPlayerUpdates(areaId) {
    console.warn('subscribeToPlayerUpdates is deprecated - using multiplayerManager');
    // AI: MultiplayerManager now handles all player updates
  }

}

// Export a singleton instance
export const playerService = new PlayerService();
