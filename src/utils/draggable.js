/**
 * AI: Makes a DOM element draggable via a handle element.
 * This function implements a robust dragging mechanism that correctly handles
 * elements initially positioned with CSS transforms and percentages. It transitions
 * the element to absolute pixel-based positioning on drag start to ensure smooth
 * and predictable movement without "jumps".
 *
 * @param {HTMLElement} element The element to be made draggable.
 * @param {HTMLElement} handle The element that acts as the drag handle. Mousedown events on this element will initiate the drag.
 * @param {object} [options] Optional configuration.
 * @param {function(HTMLElement): void} [options.onDragStart] A callback function executed once at the beginning of a drag operation. Useful for cleaning up initial positioning classes.
 */
export function makeDraggable(element, handle, options) {
  if (!element) return; // Gracefully exit if the element doesn't exist.

  // Use the handle as the trigger, or the element itself if no handle is provided.
  const dragTrigger = handle || element;

  dragTrigger.addEventListener('mousedown', dragMouseDown);

  function dragMouseDown(e) {
    // We only want to drag with the primary mouse button.
    if (e.button !== 0) return;

    // Allow specific elements within the handle to prevent dragging.
    if (e.target && e.target.closest('[data-no-drag]')) return;
    
    // Prevent default browser actions like text selection.
    e.preventDefault();

    // --- AI: Comprehensive position initialization ---
    // This is the core logic to prevent the "jump" when starting a drag.
    // 1. Get the element's current visual position on the screen.
    const rect = element.getBoundingClientRect();

    // 2. If an onDragStart callback is provided, execute it.
    // This is crucial for removing any CSS classes (like Tailwind's centering classes)
    // that could interfere with absolute pixel-based positioning.
    if (options && typeof options.onDragStart === 'function') {
      options.onDragStart(element);
    }

    // 3. For fixed-positioned elements, keep them as fixed and use viewport coordinates.
    // For absolute elements, switch to absolute positioning.
    if (element.style.position === 'fixed') {
      // Keep fixed positioning but set explicit top/left from viewport coordinates
      element.style.top = `${rect.top}px`;
      element.style.left = `${rect.left}px`;
    } else {
      // Switch to absolute positioning for other elements
      element.style.position = 'absolute';
      element.style.top = `${rect.top}px`;
      element.style.left = `${rect.left}px`;
    }

    // 4. Clear any transforms or margins that might affect positioning.
    element.style.transform = 'none';
    element.style.margin = '0';

    // --- AI: Calculate initial mouse offset ---
    // Store the mouse's position relative to the element's top-left corner.
    // This ensures the element doesn't snap its corner to the mouse cursor.
    const startOffsetX = e.clientX - rect.left;
    const startOffsetY = e.clientY - rect.top;

    // Attach the listeners for dragging and stopping the drag to the entire document.
    // This allows the user to move the mouse outside the element/window and still drag.
    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);

    function elementDrag(e) {
      e.preventDefault();

      // Calculate the new top-left position of the element.
      let newTop = e.clientY - startOffsetY;
      let newLeft = e.clientX - startOffsetX;

      // --- AI: Boundary constraints ---
      // Ensure the element stays within the viewport.
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;

      // For fixed-positioned elements, use viewport boundaries
      // For absolute elements, consider any offset parent
      const minTop = 0;
      const maxTop = window.innerHeight - elementHeight;
      const minLeft = 0;
      const maxLeft = window.innerWidth - elementWidth;

      // Clamp the new position to stay within the boundaries.
      newTop = Math.max(minTop, Math.min(newTop, maxTop));
      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));

      // Apply the new position.
      element.style.top = `${newTop}px`;
      element.style.left = `${newLeft}px`;
    }

    function closeDragElement() {
      // Cleanup: remove the event listeners from the document.
      document.removeEventListener('mousemove', elementDrag);
      document.removeEventListener('mouseup', closeDragElement);
    }
  }
}

// Single shared drag state to avoid adding global listeners per-item
import { hideInventoryTooltip } from './domUtils.js';
import { showHighlight, hideHighlight } from './domUtils.js';

let currentDrag = null;

function findDropTargetFromEvent(event) {
  // Use elementFromPoint to find the actual element under the cursor
  const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
  if (!elementBelow) return null;
  
  // Check for inventory slot first (higher priority)
  const slot = elementBelow.closest('.inventory-slot');
  if (slot) return slot;
  // Desktop is no longer a valid drop target for items
  return null;
}

let lastHighlightedTarget = null;

function highlightDropTarget(event) {
  event.preventDefault();
  
  const target = findDropTargetFromEvent(event);
  if (target) {
    showHighlight(target);
    lastHighlightedTarget = target;
  } else {
    hideHighlight();
    lastHighlightedTarget = null;
  }
}

function removeHighlight(event) {
  event.preventDefault();
  hideHighlight();
  lastHighlightedTarget = null;
}

// Global listeners (attach once)
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  // Hint to browser that this is a move operation to avoid odd default ghosts
  try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (_) {}
  highlightDropTarget(e);
});
document.addEventListener('dragleave', removeHighlight);
document.addEventListener('drop', (e) => {
  e.preventDefault();
  removeHighlight(e);
  if (!currentDrag) {
    // Fallback: try to read dataTransfer but don't call anything if we lack callback
    let data = null;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch (_) { return; }
    if (!data) return;
    const target = findDropTargetFromEvent(e);
    if (!target) return;
    return; // no callback available
  }
  const target = findDropTargetFromEvent(e);
  if (!target) return;
  const draggedEl = currentDrag.element;
  const cb = currentDrag.onDropCallback;
  try {
    cb && cb(currentDrag.itemId, currentDrag.source, target, e.clientX, e.clientY, draggedEl, currentDrag.shiftKey, currentDrag.sourceSlotIndex);
  } catch (err) {
    console.error('Drop callback failed', err);
  }
  // clear state
  currentDrag = null;
  // Clear any remaining highlights
  hideHighlight();
  lastHighlightedTarget = null;
});

/**
 * AI: Makes an inventory item draggable, setting up the necessary event listeners and data transfer.
 * This function creates an isolated drag state for each item to prevent conflicts.
 * @param {HTMLElement} element - The DOM element representing the item.
 * @param {object} itemData - The data associated with the item.
 * @param {string} currentContainerId - The ID of the container the item is being dragged from.
 * @param {function} onDropCallback - The function to call when the item is dropped.
 * @param {number} [slotIndex=-1] - The index of the slot the item is in.
 */
export function makeItemDraggable(element, itemData, currentContainerId, onDropCallback, slotIndex = -1) {
  // AI: Prevent duplicate drag setup on the same element
  if (element.hasAttribute('data-drag-setup')) {
    return; // Already set up
  }
  
  // AI: Mark element as having drag setup to prevent duplicates
  element.setAttribute('data-drag-setup', 'true');
  element.setAttribute('draggable', true);
  
  // AI: Debug logging to verify function is called
  console.log(`[DRAG] Setting up draggable for:`, { 
    element: element.tagName, 
    itemId: itemData.itemId || itemData.id, 
    container: currentContainerId, 
    slotIndex 
  });

  // AI: Use a variable to store the drag state for this specific item.
  let dragState = null;

  element.addEventListener('dragstart', (e) => {
    // AI: OLD CODE: Drag events were set up but may have had issues with event propagation
    // NEW APPROACH: Comprehensive event handling with proper debugging
    console.log(`[DRAG] Dragstart event triggered for:`, { 
      itemId: itemData.itemId || itemData.id, 
      slotIndex,
      element: element.tagName 
    });
    
    try {
      // AI: Inventory slots use 'itemId' property, item definitions use 'id' 
      const dragItemId = itemData.itemId || itemData.id;
      e.dataTransfer.setData('application/json', JSON.stringify({ itemId: dragItemId, source: currentContainerId }));
      e.dataTransfer.effectAllowed = 'move';
      // Use the actual icon as the drag image so only the item appears to move
      if (typeof e.dataTransfer.setDragImage === 'function') {
        const rect = element.getBoundingClientRect();
        const offX = rect.width / 2;
        const offY = rect.height / 2;
        e.dataTransfer.setDragImage(element, offX, offY);
      }
    } catch (_) {}
    element.classList.add('dragging-item');
  
    // AI: Create a new drag state object for this drag operation.
    // Inventory slots use 'itemId', item definitions use 'id'
    const dragItemId = itemData.itemId || itemData.id;
    dragState = {
      element,
      itemId: dragItemId,
      source: currentContainerId,
      onDropCallback,
      shiftKey: e.shiftKey,
      sourceSlotIndex: slotIndex,
    };
    // AI: Assign the drag state to the global `currentDrag` variable.
    currentDrag = dragState;
  }, { capture: true });

  element.addEventListener('dragend', () => {
    element.classList.remove('dragging-item');
    if (element.closest('.inventory-slot')) {
      hideInventoryTooltip();
    }
    // AI: Clear the global drag state and the item-specific drag state.
    currentDrag = null;
    dragState = null;
    hideHighlight();
    lastHighlightedTarget = null;
    // Ensure tooltip is hidden on drag end, even if mouse is still over the slot
    hideInventoryTooltip();
  }, { capture: true });
}
