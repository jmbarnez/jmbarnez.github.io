import { itemsById } from '../data/content.js';
import { gameState } from '../app/state.js';
import { auth } from '../utils/firebaseClient.js';
import { setPlayerGalacticTokens } from '../services/firestoreService.js';

/**
 * AI: Centralized Inventory Management System
 * Handles all inventory operations, validation, and state management
 * Provides consistent error handling and data integrity
 */
class InventoryManager {
  constructor() {
    // AI: Maximum inventory slots - centralized constant
    this.MAX_SLOTS = 24;
    
    // AI: Current inventory state - single source of truth
    this._inventory = null;
    
    // AI: Update lock to prevent concurrent modifications
    this._isUpdating = false;
    this._updateTimer = null;
    
    // AI: Event listeners for inventory changes
    this._listeners = new Set();
    
    // AI: Notification system for pickup/drop events
    this._notificationListeners = new Set();
  }

  /**
   * AI: Adds galactic tokens to the player's currency.
   * @param {number} amount - Amount of galactic tokens to add
   */
  async addGalacticTokens(amount) {
    if (amount <= 0) return;
    
    const oldTokens = gameState.galacticTokens || 0;
    gameState.galacticTokens = oldTokens + amount;
    gameState.playerCoins = gameState.galacticTokens;
    
    // Immediate coin display update
    const coinElement = document.getElementById('inventory-coin-amount');
    if (coinElement) {
      coinElement.textContent = gameState.galacticTokens.toLocaleString();
    }
    
    // Persist galactic tokens to server immediately to prevent conflicts
    try {
      const user = auth.currentUser;
      if (user && user.uid) {
        await setPlayerGalacticTokens(user.uid, gameState.galacticTokens);
      }
    } catch (err) {
      console.error('Failed to persist currency to server:', err);
      // Revert on failure
      gameState.galacticTokens = oldTokens;
      if (coinElement) coinElement.textContent = gameState.galacticTokens.toLocaleString();
    }

    // Notify listeners of galactic token change
    this._notifyChange('galacticTokensAdded', { amount, total: gameState.galacticTokens });
  }

  /**
   * AI: Gets the current galactic token amount.
   * @returns {number} Current galactic token amount
   */
  getGalacticTokens() {
    return gameState.galacticTokens || 0;
  }

  /**
   * Spend gold from the player's balance and persist the change.
   * @param {number} amount
   * @returns {{ success: boolean, message: string }}
   */
  spendGalacticTokens(amount) {
    if (amount <= 0) return { success: false, message: 'Invalid amount' };
    const current = gameState.galacticTokens || 0;
    if (current < amount) return { success: false, message: 'Insufficient galactic tokens' };

    gameState.galacticTokens = current - amount;
    gameState.playerCoins = gameState.galacticTokens;

    try {
      const user = auth.currentUser;
      if (user && user.uid) {
        setPlayerGalacticTokens(user.uid, gameState.galacticTokens).catch((err) => {
          console.warn('Failed to persist galactic tokens to server:', err);
        });
      }
    } catch (_) {}

    this._notifyChange('galacticTokensSpent', { amount, total: gameState.galacticTokens });
    return { success: true, message: 'Galactic tokens spent' };
  }

  /**
   * AI: Gets the current galactic token amount.
   * @returns {number} Current galactic token amount
   */
  getGalacticTokens() {
    return gameState.galacticTokens || 0;
  }

  /**
   * AI: Initialize inventory with data from game state
   * Ensures inventory is always valid array with correct size
   */
  initialize(inventoryData = null) {
    if (inventoryData && Array.isArray(inventoryData)) {
      this._inventory = this._normalizeInventory(inventoryData);
    } else {
      this._inventory = Array(this.MAX_SLOTS).fill(null);
    }
    
    // AI: Update global state for backward compatibility
    gameState.playerInventory = this._inventory;
    this._notifyChange('initialized', null, null);
  }

  /**
   * AI: Normalize inventory to ensure correct structure
   * Pads/trims to exact slot count, validates items
   */
  _normalizeInventory(inventory) {
    const normalized = Array(this.MAX_SLOTS).fill(null);
    
    for (let i = 0; i < Math.min(inventory.length, this.MAX_SLOTS); i++) {
      const slot = inventory[i];
      if (slot && slot.itemId && typeof slot.quantity === 'number' && slot.quantity > 0) {
        // AI: Validate item exists in content data
        if (itemsById[slot.itemId]) {
          normalized[i] = { ...slot };
        }
      }
    }
    
    return normalized;
  }

  /**
   * AI: Get current inventory state (read-only copy)
   */
  getInventory() {
    return [...this._inventory];
  }

  /**
   * AI: Get specific slot contents
   */
  getSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.MAX_SLOTS) return null;
    return this._inventory[slotIndex] ? { ...this._inventory[slotIndex] } : null;
  }

  /**
   * AI: Check if inventory update is in progress
   */
  isUpdating() {
    return this._isUpdating;
  }

  /**
   * AI: Begin inventory update - prevents concurrent modifications
   */
  _beginUpdate() {
    this._isUpdating = true;
    if (this._updateTimer) clearTimeout(this._updateTimer);
    
    // AI: Auto-release lock after timeout to prevent deadlocks
    this._updateTimer = setTimeout(() => {
      this._isUpdating = false;
      this._updateTimer = null;
    }, 6000);
  }

  /**
   * AI: End inventory update - releases modification lock
   */
  _endUpdate() {
    this._isUpdating = false;
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
  }

  /**
   * AI: Add item to inventory with stacking and validation
   * Returns { success: boolean, message: string, addedAmount: number }
   */
  addItem(itemId, quantity = 1) {
    if (this._isUpdating) {
      return { success: false, message: 'Inventory update in progress', addedAmount: 0 };
    }

    // AI: Validate item exists
    const itemDef = itemsById[itemId];
    if (!itemDef) {
      return { success: false, message: `Unknown item: ${itemId}`, addedAmount: 0 };
    }

    if (quantity <= 0) {
      return { success: false, message: 'Invalid quantity', addedAmount: 0 };
    }

    const originalInventory = this.getInventory();
    let remainingQuantity = quantity;

    try {
      // AI: Try to stack with existing items first
      for (let i = 0; i < this.MAX_SLOTS && remainingQuantity > 0; i++) {
        const slot = this._inventory[i];
        if (slot && slot.itemId === itemId) {
          // AI: Check max stack limit if item is stackable
          const maxStack = itemDef.maxStack || 99;
          const canAdd = Math.min(remainingQuantity, maxStack - slot.quantity);
          
          if (canAdd > 0) {
            slot.quantity += canAdd;
            remainingQuantity -= canAdd;
          }
        }
      }

      // AI: Add to empty slots if items remaining
      for (let i = 0; i < this.MAX_SLOTS && remainingQuantity > 0; i++) {
        if (!this._inventory[i]) {
          const maxStack = itemDef.maxStack || 99;
          const addAmount = Math.min(remainingQuantity, maxStack);
          
          this._inventory[i] = { itemId, quantity: addAmount };
          remainingQuantity -= addAmount;
        }
      }

      const addedAmount = quantity - remainingQuantity;
      
      if (addedAmount > 0) {
        // AI: Update global state for backward compatibility
        gameState.playerInventory = this._inventory;
        this._notifyChange('itemAdded', { itemId, quantity: addedAmount, remainingQuantity });
        this._notifyPickup(itemId, addedAmount);
        
        return { success: true, message: remainingQuantity > 0 ? 'Partially added (inventory full)' : 'Added successfully', addedAmount };
      } else {
        return { success: false, message: 'Inventory full', addedAmount: 0 };
      }

    } catch (error) {
      // AI: Restore original inventory on error
      this._inventory = originalInventory;
      gameState.playerInventory = this._inventory;
      return { success: false, message: `Error adding item: ${error.message}`, addedAmount: 0 };
    }
  }

  /**
   * AI: Remove item from inventory
   * Returns { success: boolean, message: string, removedAmount: number }
   */
  removeItem(itemId, quantity = 1, fromSlotIndex = -1) {
    if (this._isUpdating) {
      return { success: false, message: 'Inventory update in progress', removedAmount: 0 };
    }

    if (quantity <= 0) {
      return { success: false, message: 'Invalid quantity', removedAmount: 0 };
    }

    const originalInventory = this.getInventory();
    let remainingToRemove = quantity;

    try {
      if (fromSlotIndex >= 0 && fromSlotIndex < this.MAX_SLOTS) {
        // AI: Remove from specific slot
        const slot = this._inventory[fromSlotIndex];
        if (slot && slot.itemId === itemId) {
          const canRemove = Math.min(remainingToRemove, slot.quantity);
          slot.quantity -= canRemove;
          remainingToRemove -= canRemove;
          
          if (slot.quantity <= 0) {
            this._inventory[fromSlotIndex] = null;
          }
        }
      } else {
        // AI: Remove from any slot with matching item
        for (let i = 0; i < this.MAX_SLOTS && remainingToRemove > 0; i++) {
          const slot = this._inventory[i];
          if (slot && slot.itemId === itemId) {
            const canRemove = Math.min(remainingToRemove, slot.quantity);
            slot.quantity -= canRemove;
            remainingToRemove -= canRemove;
            
            if (slot.quantity <= 0) {
              this._inventory[i] = null;
            }
          }
        }
      }

      const removedAmount = quantity - remainingToRemove;
      
      if (removedAmount > 0) {
        // AI: Update global state for backward compatibility
        gameState.playerInventory = this._inventory;
        this._notifyChange('itemRemoved', { itemId, quantity: removedAmount });
        
        return { success: true, message: 'Removed successfully', removedAmount };
      } else {
        return { success: false, message: 'Item not found or insufficient quantity', removedAmount: 0 };
      }

    } catch (error) {
      // AI: Restore original inventory on error
      this._inventory = originalInventory;
      gameState.playerInventory = this._inventory;
      return { success: false, message: `Error removing item: ${error.message}`, removedAmount: 0 };
    }
  }

  /**
   * AI: Move item between slots (drag and drop support)
   * Returns { success: boolean, message: string }
   */
  moveItem(fromSlotIndex, toSlotIndex) {
    if (this._isUpdating) {
      return { success: false, message: 'Inventory update in progress' };
    }

    if (fromSlotIndex < 0 || fromSlotIndex >= this.MAX_SLOTS || 
        toSlotIndex < 0 || toSlotIndex >= this.MAX_SLOTS) {
      return { success: false, message: 'Invalid slot index' };
    }

    if (fromSlotIndex === toSlotIndex) {
      return { success: true, message: 'No change needed' };
    }

    const originalInventory = this.getInventory();

    try {
      const sourceSlot = this._inventory[fromSlotIndex];
      const targetSlot = this._inventory[toSlotIndex];

      if (!sourceSlot) {
        return { success: false, message: 'Source slot is empty' };
      }

      // AI: Handle different move scenarios
      if (!targetSlot) {
        // AI: Move to empty slot
        this._inventory[toSlotIndex] = sourceSlot;
        this._inventory[fromSlotIndex] = null;
      } else if (targetSlot.itemId === sourceSlot.itemId) {
        // AI: Stack items of same type
        const itemDef = itemsById[sourceSlot.itemId];
        const maxStack = itemDef?.maxStack || 99;
        const canStack = Math.min(sourceSlot.quantity, maxStack - targetSlot.quantity);
        
        if (canStack > 0) {
          targetSlot.quantity += canStack;
          sourceSlot.quantity -= canStack;
          
          if (sourceSlot.quantity <= 0) {
            this._inventory[fromSlotIndex] = null;
          }
        } else {
          // AI: Can't stack, swap items
          this._inventory[fromSlotIndex] = targetSlot;
          this._inventory[toSlotIndex] = sourceSlot;
        }
      } else {
        // AI: Swap different items
        this._inventory[fromSlotIndex] = targetSlot;
        this._inventory[toSlotIndex] = sourceSlot;
      }

      // AI: Update global state for backward compatibility
      gameState.playerInventory = this._inventory;
      this._notifyChange('itemMoved', { fromSlotIndex, toSlotIndex });
      
      return { success: true, message: 'Item moved successfully' };

    } catch (error) {
      // AI: Restore original inventory on error
      this._inventory = originalInventory;
      gameState.playerInventory = this._inventory;
      return { success: false, message: `Error moving item: ${error.message}` };
    }
  }

  /**
   * AI: Split item stack (shift-click functionality)
   * Returns { success: boolean, message: string }
   */
  splitStack(slotIndex) {
    if (this._isUpdating) {
      return { success: false, message: 'Inventory update in progress' };
    }

    if (slotIndex < 0 || slotIndex >= this.MAX_SLOTS) {
      return { success: false, message: 'Invalid slot index' };
    }

    const slot = this._inventory[slotIndex];
    if (!slot || slot.quantity <= 1) {
      return { success: false, message: 'Cannot split single item or empty slot' };
    }

    // AI: Find empty slot for split
    const emptySlotIndex = this._inventory.findIndex(s => s === null);
    if (emptySlotIndex === -1) {
      return { success: false, message: 'No empty slot available for split' };
    }

    const originalInventory = this.getInventory();

    try {
      const splitAmount = Math.ceil(slot.quantity / 2);
      const remainingAmount = slot.quantity - splitAmount;

      slot.quantity = remainingAmount;
      this._inventory[emptySlotIndex] = { itemId: slot.itemId, quantity: splitAmount };

      // AI: Update global state for backward compatibility
      gameState.playerInventory = this._inventory;
      this._notifyChange('stackSplit', { slotIndex, emptySlotIndex, splitAmount });
      
      return { success: true, message: 'Stack split successfully' };

    } catch (error) {
      // AI: Restore original inventory on error
      this._inventory = originalInventory;
      gameState.playerInventory = this._inventory;
      return { success: false, message: `Error splitting stack: ${error.message}` };
    }
  }

  /**
   * AI: Sort inventory by item type and quantity
   * Returns { success: boolean, message: string }
   */
  sortInventory() {
    if (this._isUpdating) {
      return { success: false, message: 'Inventory update in progress' };
    }

    const originalInventory = this.getInventory();

    try {
      // AI: Extract non-null items and sort them
      const items = this._inventory.filter(item => item !== null);
      
      items.sort((a, b) => {
        const itemA = itemsById[a.itemId];
        const itemB = itemsById[b.itemId];
        
        // AI: Sort by item name first, then by quantity descending
        const nameCompare = (itemA?.name || '').localeCompare(itemB?.name || '');
        if (nameCompare !== 0) return nameCompare;
        
        return b.quantity - a.quantity;
      });

      // AI: Rebuild inventory with sorted items
      this._inventory = Array(this.MAX_SLOTS).fill(null);
      items.forEach((item, index) => {
        if (index < this.MAX_SLOTS) {
          this._inventory[index] = item;
        }
      });

      // AI: Update global state for backward compatibility
      gameState.playerInventory = this._inventory;
      this._notifyChange('inventorySorted', null);
      
      return { success: true, message: 'Inventory sorted successfully' };

    } catch (error) {
      // AI: Restore original inventory on error
      this._inventory = originalInventory;
      gameState.playerInventory = this._inventory;
      return { success: false, message: `Error sorting inventory: ${error.message}` };
    }
  }

  /**
   * AI: Get total count of specific item across all slots
   */
  getItemCount(itemId) {
    return this._inventory.reduce((total, slot) => {
      return slot && slot.itemId === itemId ? total + slot.quantity : total;
    }, 0);
  }

  /**
   * AI: Check if inventory has sufficient quantity of item
   */
  hasItem(itemId, quantity = 1) {
    return this.getItemCount(itemId) >= quantity;
  }

  /**
   * AI: Get all unique items in inventory
   */
  getUniqueItems() {
    const items = new Map();
    this._inventory.forEach(slot => {
      if (slot) {
        const existing = items.get(slot.itemId) || 0;
        items.set(slot.itemId, existing + slot.quantity);
      }
    });
    return items;
  }

  /**
   * AI: Subscribe to inventory change events
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
    return () => this._listeners.delete(callback);
  }

  /**
   * AI: Subscribe to pickup/drop notification events
   */
  subscribeNotifications(callback) {
    if (typeof callback === 'function') {
      this._notificationListeners.add(callback);
    }
    return () => this._notificationListeners.delete(callback);
  }

  /**
   * AI: Notify listeners of inventory changes
   */
  _notifyChange(type, data) {
    this._listeners.forEach(callback => {
      try {
        callback({ type, data, inventory: this.getInventory() });
      } catch (error) {
        console.error('Error in inventory change listener:', error);
      }
    });
  }

  /**
   * AI: Notify listeners of pickup events
   */
  _notifyPickup(itemId, quantity) {
    this._notificationListeners.forEach(callback => {
      try {
        callback({ type: 'pickup', itemId, quantity });
      } catch (error) {
        console.error('Error in inventory notification listener:', error);
      }
    });
  }

  /**
   * AI: Notify listeners of drop events  
   */
  _notifyDrop(itemId, quantity) {
    this._notificationListeners.forEach(callback => {
      try {
        callback({ type: 'drop', itemId, quantity });
      } catch (error) {
        console.error('Error in inventory notification listener:', error);
      }
    });
  }

  /**
   * AI: Begin managed update session
   * Prevents other operations during critical updates
   */
  async withUpdateLock(operation) {
    if (this._isUpdating) {
      throw new Error('Inventory update already in progress');
    }

    this._beginUpdate();
    try {
      return await operation();
    } finally {
      this._endUpdate();
    }
  }

  /**
   * AI: Validate entire inventory structure
   * Returns array of validation errors
   */
  validateInventory() {
    const errors = [];

    if (!Array.isArray(this._inventory)) {
      errors.push('Inventory is not an array');
      return errors;
    }

    if (this._inventory.length !== this.MAX_SLOTS) {
      errors.push(`Inventory has ${this._inventory.length} slots, expected ${this.MAX_SLOTS}`);
    }

    this._inventory.forEach((slot, index) => {
      if (slot === null || slot === undefined) return;

      if (!slot.itemId) {
        errors.push(`Slot ${index} missing itemId`);
      } else if (!itemsById[slot.itemId]) {
        errors.push(`Slot ${index} has unknown item: ${slot.itemId}`);
      }

      if (typeof slot.quantity !== 'number' || slot.quantity <= 0) {
        errors.push(`Slot ${index} has invalid quantity: ${slot.quantity}`);
      }

      const itemDef = itemsById[slot.itemId];
      if (itemDef && itemDef.maxStack && slot.quantity > itemDef.maxStack) {
        errors.push(`Slot ${index} exceeds max stack (${slot.quantity} > ${itemDef.maxStack})`);
      }
    });

    return errors;
  }
}

// AI: Export singleton instance for consistent state management
export const inventoryManager = new InventoryManager();