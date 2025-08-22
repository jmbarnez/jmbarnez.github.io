import { gameState } from '../app/state.js';
import { itemsById } from '../data/content.js';
import { makeItemDraggable } from '../utils/draggable.js';
import { addWorldItemAtPlayer } from '../game/items.js';
import { setPlayerInventory } from '../services/firestoreService.js';
import { auth } from '../utils/firebaseClient.js';
import { createPixelIconForItem } from '../data/pixelIcons.js';
import { handleItemDrop } from './dragDrop.js';
import { inventoryManager } from '../game/inventoryManager.js';
import { getTime } from '../utils/math.js';
import { hideInventoryTooltip, showInventoryTooltip } from '../utils/domUtils.js';

// AI: DOM elements that the inventory system needs to interact with.
// These are initialized in `initInventory` from `desktop.js`.
let inventoryGrid; // AI: The main grid container for inventory slots.
let desktopScreen; // AI: The top-level container for all UI elements.
let inventorySortButton; // AI: The button used to sort the inventory.
let inventoryCoinAmount; // AI: The text element displaying the player's coin count.
let inventoryCoinIconContainer; // AI: The container for the coin icon.

/**
 * AI: Updates the coin display in the inventory panel.
 * @param {number} amount - The new coin amount to display.
 */
export function updateCoinDisplay(amount) {
  // Always re-query the element to ensure we have the latest reference
  inventoryCoinAmount = document.getElementById('inventory-coin-amount');
  
  if (inventoryCoinAmount) {
    inventoryCoinAmount.textContent = amount.toLocaleString();
    
    // Also update gameState to ensure consistency
    gameState.galacticTokens = amount;
    gameState.playerCoins = amount;
  }
}

// AI: Update state management now handled by inventoryManager
// Deprecated functions kept for backward compatibility
export function beginInventoryUpdate() {
  gameState.isInventoryUpdating = true;
}

export function endInventoryUpdate() {
  gameState.isInventoryUpdating = false;
}

/**
 * AI: Save inventory to database using current user
 */
async function saveInventoryToDatabase() {
  const user = auth.currentUser;
  if (!user) return;
  
  beginInventoryUpdate();
  try {
    await setPlayerInventory(user.uid, inventoryManager.getInventory());
  } finally {
    endInventoryUpdate();
  }
}

// Pickup notification system above inventory
function ensurePickupOverlay() {
  if (!desktopScreen) return null;
  let overlay = document.getElementById('pickup-notifications');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pickup-notifications';
    // Positioning: center above the bottom action bar. Use fixed positioning
    // and a flex column to stack notifications upwards. This avoids per-item
    // absolute positioning which caused placement issues across layouts.
    overlay.style.position = 'fixed';
    overlay.style.left = '50%';
    overlay.style.transform = 'translateX(-50%)';
    overlay.style.bottom = '72px'; // slightly above the bottom action bar
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '65';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column-reverse'; // newest on top
    overlay.style.alignItems = 'center';
    overlay.style.gap = '8px';
    desktopScreen.appendChild(overlay);
  }
  return overlay;
}

const pickupNotifications = [];
let notificationIdCounter = 0;

// Track last known item counts to avoid showing pickup notifications for
// spurious/early events. We update this map after each successful render.
const _lastKnownItemCounts = new Map();

function showPickupNotification(itemId, count) {
  const overlay = ensurePickupOverlay();
  if (!overlay) return;
  
  const item = itemsById[itemId];
  const name = item?.name || itemId;
  
  // Check if there's already a recent notification for this item
  const existingNotification = pickupNotifications.find(n => 
    n.itemId === itemId && (getTime() - n.startTime) < 1000
  );
  
  if (existingNotification) {
    // Stack with existing notification
    existingNotification.count += count;
    existingNotification.text = `+${existingNotification.count} ${name}`;
    existingNotification.startTime = getTime(); // Reset timer
    
    // Update existing DOM element
    const existingEl = overlay.querySelector(`[data-id="${existingNotification.id}"]`);
    if (existingEl) {
      const textEl = existingEl.querySelector('span');
      if (textEl) textEl.textContent = existingNotification.text;
    }
    return;
  }
  
  const text = `+${count} ${name}`;
  const id = notificationIdCounter++;
  const notification = {
    id,
    itemId,
    count,
    text,
    startTime: getTime(),
    duration: 2000
  };
  
  pickupNotifications.push(notification);
  
  // Create DOM element
  const el = document.createElement('div');
  el.className = 'pickup-notification';
  el.dataset.id = id;
  // Styles are now handled by the .pickup-notification CSS class.
  
  // Create icon element
  const iconEl = document.createElement('div');
  iconEl.style.width = '12px';
  iconEl.style.height = '12px';
  iconEl.style.flexShrink = '0';
  
  // Create pixel icon for the item
  if (item?.icon) {
    const icon = createPixelIconForItem(item, { cssSize: 12, scale: 1 });
    iconEl.appendChild(icon);
  } else {
    // Fallback to a simple colored square
    iconEl.style.background = '#666';
    iconEl.style.border = '1px solid #999';
  }
  
  // Create text element
  const textEl = document.createElement('span');
  textEl.textContent = text;
  
  el.appendChild(iconEl);
  el.appendChild(textEl);
  
  overlay.appendChild(el);
  
  // Positioning is handled by the overlay (centered above bottom bar).
  // Do not set absolute top/left on the notification element to avoid layout wars.
  
  // Start animation loop if not already running
  if (pickupNotifications.length === 1) {
    updatePickupNotifications();
  }
}

function showDropNotification(itemId, count) {
  const overlay = ensurePickupOverlay();
  if (!overlay) return;

  const item = itemsById[itemId];
  const name = item?.name || itemId;
  const text = `Dropped ${count} ${name}`;

  const id = notificationIdCounter++;
  const notification = {
    id,
    text,
    startTime: getTime(),
    duration: 2000,
  };

  pickupNotifications.push(notification);

  const el = document.createElement('div');
  el.className = 'pickup-notification';
  el.dataset.id = id;
  // Visual tweak to differentiate drop vs pickup
  el.style.borderColor = '#f87171'; // rose-400

  const iconEl = document.createElement('div');
  iconEl.style.width = '12px';
  iconEl.style.height = '12px';
  iconEl.style.flexShrink = '0';

  if (item?.icon) {
    const icon = createPixelIconForItem(item, { cssSize: 12, scale: 1 });
    iconEl.appendChild(icon);
  } else {
    iconEl.style.background = '#666';
    iconEl.style.border = '1px solid #999';
  }

  const textEl = document.createElement('span');
  textEl.textContent = text;

  el.appendChild(iconEl);
  el.appendChild(textEl);

  overlay.appendChild(el);

  const inventoryButton = document.getElementById('inventory-button');
  if (inventoryButton) {
    const rect = inventoryButton.getBoundingClientRect();
    const desktopRect = desktopScreen.getBoundingClientRect();
    el.style.left = `${rect.left + rect.width / 2 - desktopRect.left}px`;
    el.style.top = `${rect.top - 35 - desktopRect.top}px`;
  }

  if (pickupNotifications.length === 1) {
    updatePickupNotifications();
  }
}

function updatePickupNotifications() {
  const overlay = ensurePickupOverlay();
  if (!overlay) return;
  
  const now = getTime();
  
  // Remove expired notifications
  for (let i = pickupNotifications.length - 1; i >= 0; i--) {
    const notification = pickupNotifications[i];
    const elapsed = now - notification.startTime;
    
    if (elapsed >= notification.duration) {
      const el = overlay.querySelector(`[data-id="${notification.id}"]`);
      if (el) el.remove();
      pickupNotifications.splice(i, 1);
    } else {
      // Update opacity for fade out
      const el = overlay.querySelector(`[data-id="${notification.id}"]`);
      if (el) {
        const progress = elapsed / notification.duration;
        const opacity = progress < 0.8 ? 1 : (1 - (progress - 0.8) / 0.2);
        el.style.opacity = opacity;
        
        // Position handled by overlay flexbox; no per-element top needed
        const index = pickupNotifications.indexOf(notification);
        if (el) {
          // Slight vertical offset handled by gap on overlay; ensure order is newest on top
          el.style.order = String(-index);
        }
      }
    }
  }
  
  // Continue animation if there are notifications
  if (pickupNotifications.length > 0) {
    requestAnimationFrame(updatePickupNotifications);
  }
}

export function initInventory(gridElement, desktopElement) {
  inventoryGrid = gridElement;
  desktopScreen = desktopElement;

  // AI: Initialize inventory manager with current game state
  inventoryManager.initialize(gameState.playerInventory);

  // AI: Subscribe to inventory changes for UI updates
  inventoryManager.subscribe(({ type, data }) => {
    renderInventory();
    // After rendering, refresh the known counts snapshot so notifications
    // can compare future pickups against the current state.
    try {
      const inv = inventoryManager.getInventory();
      const counts = new Map();
      inv.forEach(slot => {
        if (slot) counts.set(slot.itemId, (counts.get(slot.itemId) || 0) + slot.quantity);
      });
      _lastKnownItemCounts.clear();
      counts.forEach((v, k) => _lastKnownItemCounts.set(k, v));
    } catch (_) {}
  });

  // Subscribe to galactic token changes so desktop/other UI can call updateCoinDisplay
  inventoryManager.subscribe((event) => {
    if (event.type === 'galacticTokensAdded' && typeof event.data?.amount === 'number') {
      const currentTokens = inventoryManager.getGalacticTokens ? inventoryManager.getGalacticTokens() : gameState.galacticTokens || 0;
      updateCoinDisplay(currentTokens);
    }
  });

  // AI: Subscribe to pickup/drop notifications
  inventoryManager.subscribeNotifications(({ type, itemId, quantity }) => {
    // inventoryManager only emits 'pickup' when items were actually added.
    // Therefore we can safely show the pickup notification here unconditionally
    // for pickup events. This avoids missing notifications due to snapshot timing.
    if (type === 'pickup') {
      showPickupNotification(itemId, quantity);
      try {
        // Update our known counts snapshot to reflect the new state
        const current = inventoryManager.getItemCount(itemId);
        _lastKnownItemCounts.set(itemId, current);
      } catch (_) {}
    } else if (type === 'drop') {
      showDropNotification(itemId, quantity);
    }
  });

  // Create the inventory slots once during initialization
  if (inventoryGrid) {
    inventoryGrid.innerHTML = ''; // Clear any existing content
    for (let i = 0; i < inventoryManager.MAX_SLOTS; i++) {
      const slot = document.createElement('div');
      // Rely on .inventory-slot CSS for sizing; keep layout classes only
      slot.className = 'bg-slate-800/80 flex items-center justify-center relative inventory-slot';
      slot.dataset.slotIndex = i;
      inventoryGrid.appendChild(slot);
    }
  }

  // AI: Initialize the sort button and attach event listener.
  inventorySortButton = document.getElementById('inventory-sort-button');
  if (inventorySortButton) {
    inventorySortButton.addEventListener('click', sortInventory);
  }

  // AI: Initialize coin pouch elements.
  inventoryCoinAmount = document.getElementById('inventory-coin-amount');
  inventoryCoinIconContainer = document.getElementById('inventory-coin-icon-container');
  // AI: The coin icon itself is initialized in desktop.js, just need to reference the container here.
  
  // AI: Initialize coin display with current galactic token amount
  const initialTokens = inventoryManager.getGalacticTokens ? inventoryManager.getGalacticTokens() : gameState.galacticTokens || 0;
  updateCoinDisplay(initialTokens);
}

// Utility to get item definition from items.json
function getItemDefinition(itemId) {
  try {
    return itemsById && itemsById[itemId];
  } catch (error) {
    console.warn('[INVENTORY] Error getting item definition:', error, { itemId });
    return null;
  }
}

// Utility to check if an item is currency
function isCurrency(itemId) {
  try {
    const item = getItemDefinition(itemId);
    return item && item.currency === true;
  } catch (error) {
    console.warn('[INVENTORY] Error checking if item is currency:', error, { itemId });
    return false;
  }
}

// AI: Add item to player inventory using centralized manager
export async function addItemToInventory(itemId, quantity = 1) {
  // Validate input parameters
  if (!itemId || typeof itemId !== 'string') {
    console.error('[INVENTORY] Invalid itemId:', itemId);
    return false;
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    console.error('[INVENTORY] Invalid quantity:', quantity);
    return false;
  }

  // Handle currency items - they go to the currency pouch instead of inventory
  if (isCurrency(itemId)) {
    try {
      await inventoryManager.addGalacticTokens(quantity);
      return true;
    } catch (err) {
      console.error('Failed to add currency item:', err);
      return false;
    }
  }
  
  // Continue with regular item processing for non-currency items

  let result;
  try {
    result = inventoryManager.addItem(itemId, quantity);
  } catch (managerError) {
    console.error('[INVENTORY] Error in inventoryManager.addItem:', managerError, { itemId, quantity });
    return false;
  }
  
  if (result.success && result.addedAmount > 0) {
    // Render UI changes
    renderInventory();

    // Notify listeners via inventoryManager already triggers pickup notifications
    // Persist changes to database
    const user = auth.currentUser;
    if (user) {
      saveInventoryToDatabase().catch(error => {
        console.warn('Failed to save inventory after adding item:', error);
      });
    }
  } else if (!result.success) {
    console.error('[INVENTORY] FAILED to add item to inventory:', {
      itemId,
      quantity,
      result,
      itemExists: !!getItemDefinition(itemId),
      itemDefinition: getItemDefinition(itemId),
      inventorySlots: inventoryManager.getInventory().filter(slot => slot !== null).length,
      maxSlots: inventoryManager.MAX_SLOTS || 24
    });
    return result; // Return the full result object for debugging
  }

  return result.success;
}

// AI: Remove item from player inventory using centralized manager
export function removeItemFromInventory(itemId, quantity = 1, slotIndex = -1) {
  const result = inventoryManager.removeItem(itemId, quantity, slotIndex);
  
  if (result.success) {
    renderInventory();
    try { window.__lastInvWriteAt = Date.now(); } catch (_) {}
  }
  
  return result.success;
}

// AI: Render inventory using data from inventory manager
export function renderInventory() {
  if (!inventoryGrid) return;

  // AI: Get current inventory from manager
  const currentInventory = inventoryManager.getInventory();

  // Fill slots with items we actually have
  currentInventory.forEach((slotContent, i) => {
    const slot = inventoryGrid.children[i];
    if (!slot) return; // Defensive check

    // Always clear the slot first to ensure a clean re-render
    slot.innerHTML = '';
    slot.title = '';
    delete slot.dataset.itemId;
    delete slot.dataset.quantity;
    // Remove all event listeners to prevent duplicates
    slot.onmouseenter = null;
    slot.onmousemove = null;
    slot.onmouseleave = null;
    slot.onclick = null;
    slot.oncontextmenu = null;

    if (slotContent) {
      // If slot has content, render it
      const item = getItemDefinition(slotContent.itemId);
      if (item) {
        slot.dataset.itemId = slotContent.itemId;
        slot.dataset.quantity = slotContent.quantity;

        const icon = createPixelIconForItem(item, { cssSize: 24, scale: 2 });
        slot.appendChild(icon);
        // Remove native title tooltip; use front-UI tooltip overlay instead
        slot.removeAttribute('title');
        
        
        if (slotContent.quantity > 1) {
          const quantitySpan = document.createElement('span');
          quantitySpan.className = 'absolute bottom-0 right-0 bg-slate-700/80 text-slate-200 text-[10px] px-0.5 rounded-tl';
          quantitySpan.textContent = slotContent.quantity;
          slot.appendChild(quantitySpan);
        }
        
        // AI: Make the icon draggable, not the entire slot.
        // Pass slotContent (contains itemId) instead of item (contains id)
        // This ensures the drag system gets the correct item identifier
        makeItemDraggable(icon, slotContent, 'inventory', handleItemDrop, i);

        // AI: Tooltip events should still be attached to the slot for a larger hover area.
        // Function now imported from domUtils.js
        slot.onmouseenter = (e) => {
          const item = getItemDefinition(slotContent.itemId);
          if (item) {
            showInventoryTooltip(item, e.clientX, e.clientY);
          }
        };
        slot.onmousemove = (e) => {
          const item = getItemDefinition(slotContent.itemId);
          if (item) {
            showInventoryTooltip(item, e.clientX, e.clientY);
          }
        };
        slot.onmouseleave = () => hideInventoryTooltip();
        
        // SHIFT-Click: split half into a new empty slot (no world drop)
        // Use property assignment to avoid duplicate handlers across re-renders
        slot.onclick = null;
        slot.onclick = (e) => {
          if (e.shiftKey && slotContent.quantity > 1) {
            e.preventDefault();
            e.stopPropagation();

            // AI: Use inventoryManager for stack splitting
            const result = inventoryManager.splitStack(i);
            if (result.success) {
              renderInventory();
              
              // AI: Persist changes to database
              const user = auth.currentUser;
              if (user) {
                saveInventoryToDatabase().catch(error => {
                  console.warn('Failed to save inventory after splitting:', error);
                });
              }
            } else {
              console.warn(result.message);
            }
          }
        };

        // Right-Click: drop entire stack into world at player position
        // Use property assignment to avoid duplicate handlers across re-renders
        slot.oncontextmenu = null;
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Ensure tooltip is not left visible after right-click
          try { hideInventoryTooltip(); } catch (_) {}
          if (!slotContent || !slotContent.itemId || slotContent.quantity <= 0) return;

          const qty = slotContent.quantity;
          const itemId = slotContent.itemId;
          const user = auth.currentUser;
          if (!user) { 
            console.warn('No user; cannot drop items to world.'); 
            return; 
          }

          // AI: Use inventoryManager to remove items from specific slot
          const result = inventoryManager.removeItem(itemId, qty, i);
          if (result.success) {
            renderInventory();

            // Add item to world at player position
            try { addWorldItemAtPlayer(itemId, qty); } catch (err) { console.warn('Failed to add world item', err); }

            // Persist changes to database
            saveInventoryToDatabase().catch(error => { console.warn('Failed to save inventory after dropping item:', error); });
          } else {
            console.warn(result.message);
          }
          return false;
        };
      }
    }
  });
}

// AI: Sort inventory using centralized manager
export function sortInventory() {
  const result = inventoryManager.sortInventory();
  
  if (result.success) {
    renderInventory();
    
    // AI: Persist changes to database
    const user = auth.currentUser;
    if (user) {
      saveInventoryToDatabase().catch(error => {
        console.warn('Failed to save inventory after sorting:', error);
      });
    }
  } else {
    console.warn(result.message);
  }
}

// AI: Global API for debugging inventory
window.debugInventory = function() {
  console.log('Inventory Debug:', {
    inventory: inventoryManager.getInventory(),
    occupiedSlots: inventoryManager.getInventory().filter(slot => slot !== null).length,
    maxSlots: inventoryManager.MAX_SLOTS || 24
  });
};

// AI: Global API for testing item pickup
window.testItemPickup = function(itemType = 'seashell', count = 1) {
  console.log('Testing item pickup:', { itemType, count });
  return addItemToInventory(itemType, count);
};

// AI: Test all available items
window.testAllItems = function() {
  const testItems = ['seashell', 'driftwood', 'seaweed', 'stone', 'galactic_token'];
  console.log('Testing all available items...');

  testItems.forEach(itemType => {
    console.log(`\n--- Testing ${itemType} ---`);
    const result = addItemToInventory(itemType, 1);
    console.log('Result:', result);
  });
};
