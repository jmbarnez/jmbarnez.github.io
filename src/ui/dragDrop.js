import { gameState } from '../app/state.js';
import { itemsById } from '../data/content.js';
import { renderInventory, removeItemFromInventory, addItemToInventory, beginInventoryUpdate, endInventoryUpdate } from './inventory.js';
import { setPlayerInventory } from '../services/firestoreService.js';
import { auth } from '../utils/firebaseClient.js';
import { inventoryManager } from '../game/inventoryManager.js';
import { within } from '../utils/math.js';

let desktopScreen;

export function initDragDrop(desktopElement) {
  desktopScreen = desktopElement;
}

function getItemDefinition(itemId) {
  return itemsById[itemId];
}

export function handleItemDrop(itemId, source, targetElement, clientX, clientY, draggedEl, shiftKey = false, sourceSlotIndex = -1) {
  // AI: OLD CODE: Drop handling existed but may have had missing debugging
  // NEW APPROACH: Comprehensive drop handling with detailed logging for debugging
  console.log(`[DROP] Item drop triggered:`, { 
    itemId, 
    source, 
    targetElement: targetElement?.tagName, 
    targetClass: targetElement?.className,
    sourceSlotIndex,
    shiftKey 
  });
  
  // AI: Check inventory manager update status instead of global state
  if (inventoryManager.isUpdating()) {
    console.warn("Inventory update in progress. Please wait.");
    return;
  }
  const item = getItemDefinition(itemId);
  if (!item) {
    console.warn(`[DROP] Item definition not found for: ${itemId}`);
    return;
  }

  // Robustly resolve slot index: "0" is a valid value, so don't use truthiness
  const targetSlotIndex = (targetElement && targetElement.dataset && ('slotIndex' in targetElement.dataset))
    ? Number.parseInt(targetElement.dataset.slotIndex, 10)
    : -1;
  // Normalize NaN to -1
  const normalizedTargetSlotIndex = Number.isFinite(targetSlotIndex) ? targetSlotIndex : -1;

  const desktopRect = desktopScreen.getBoundingClientRect();
  const dropX = clientX - desktopRect.left;
  const dropY = clientY - desktopRect.top;

  const isDropToSlot = targetElement?.classList.contains('inventory-slot');
  const isDropToDesktop = false; // Disabled: no dropping to desktop/world via drag

  if (source === 'inventory') {
    handleInventoryDrop(itemId, { isDropToSlot, isDropToDesktop, sourceSlotIndex, targetSlotIndex: normalizedTargetSlotIndex, dropX, dropY, shiftKey, item });
  } else if (source === 'ground') {
    // Dragging ground items into inventory/desktop is disabled (auto-magnet pickup)
    return;
  }
}

function handleInventoryDrop(itemId, context) {
  const { isDropToSlot, isDropToDesktop, sourceSlotIndex, targetSlotIndex, dropX, dropY, shiftKey, item } = context;
  
  // AI: OLD CODE: Drop handling was implemented but lacked comprehensive logging
  // NEW APPROACH: Detailed logging for all inventory drop operations
  console.log(`[DROP] Inventory drop details:`, { 
    itemId, 
    sourceSlotIndex, 
    targetSlotIndex, 
    isDropToSlot, 
    isDropToDesktop 
  });

  if (sourceSlotIndex === -1) {
    console.warn('Inventory item dropped from unknown source slot.');
    return;
  }

  if (isDropToSlot) {
    console.log(`[DROP] Moving item from slot ${sourceSlotIndex} to slot ${targetSlotIndex}`);
    // AI: Use inventory manager to handle the move operation
    const result = inventoryManager.moveItem(sourceSlotIndex, targetSlotIndex);
    console.log(`[DROP] Move result:`, result);
    
    if (result.success) {
      // AI: Persist changes to database
      const user = auth.currentUser;
      if (user) {
        beginInventoryUpdate();
        setPlayerInventory(user.uid, inventoryManager.getInventory())
          .catch((error) => {
            console.warn('Inventory save failed after move:', error);
          })
          .finally(() => {
            endInventoryUpdate();
          });
      }
    } else {
      console.warn(result.message);
    }
  }
}

// Ground drop handling removed
