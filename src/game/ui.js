// In‑game HUD drawing (toasts, prompts, progress bars)
import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { drawPixelIcon, drawOutline, getItemBounds, isPointInItemBounds } from '../data/pixelIcons.js';
import { showHighlight, hideHighlight } from '../utils/domUtils.js';
import { getNearestWorldObject, worldObjects } from './worldObjects.js';
import { getEnemies } from './enemies.js'; // AI: Import getEnemies to access enemy list
import { INTERACTION_RADIUS } from '../utils/constants.js'; // AI: Import INTERACTION_RADIUS constant

/**
 * Renders dynamic DOM elements for ground items, resource nodes, world objects, and enemies
 * to provide precise mouse hover highlighting.
 * This function identifies the item, node, object, or enemy currently under the mouse cursor
 * and applies a visual highlight (outline) to its corresponding DOM element. It ensures that
 * only one interactable entity is highlighted at a time.
 */
export function renderDomGroundItemHint() {
  const { mouse, canvas, ctx, WORLD_WIDTH, WORLD_HEIGHT } = game;
  // AI: Ensure canvas and mouse coordinates are valid before proceeding.
  if (!canvas || !ctx || !mouse || typeof mouse.x === 'undefined' || typeof mouse.y === 'undefined') {
    return;
  }

  // AI: Convert raw mouse coordinates (which are already world coordinates from core.js)
  // to screen coordinates to check for mouse over on DOM elements.
  const screenMouseX = worldToScreenCoords(mouse.x, mouse.y, game.camera || { x: 0, y: 0, zoom: 1 }).x;
  const screenMouseY = worldToScreenCoords(mouse.x, mouse.y, game.camera || { x: 0, y: 0, zoom: 1 }).y;

  let hoveredElement = null;
  let hoveredEntity = null; // AI: Store the actual entity object (item, node, object, or enemy)
  let hoverType = null; // AI: To distinguish between groundItem, resourceNode, worldObject, enemy

  // AI: Helper function to check if mouse is over an entity and update hovered state.
  // It returns the DOM element if hovered and within the interaction radius, otherwise null.
  const checkHover = (entity, type, domClass, scale = 1.5, interactionRadius = INTERACTION_RADIUS) => {
    // AI: Skip if entity is dead (enemies) or otherwise not interactable.
    if (entity.isDead || entity.hp <= 0) return null;

    // AI: Convert entity's world coordinates to screen coordinates for DOM element lookup.
    const entityScreenCoords = worldToScreenCoords(entity.x, entity.y, game.camera || { x: 0, y: 0, zoom: 1 });
    if (!entityScreenCoords) return null; // Entity is off-screen.

    // AI: Find the corresponding DOM element using a data attribute that uniquely identifies it.
    // This assumes DOM elements have a 'data-item-key', 'data-node-key', or 'data-object-id' attribute.
    const keyAttribute = type === 'groundItem' ? 'data-item-key' :
                         type === 'resourceNode' ? 'data-node-key' :
                         type === 'worldObject' ? 'data-object-id' :
                         type === 'enemy' ? 'data-enemy-id' : null;

    let element = document.querySelector(`.${domClass}[${keyAttribute}="${entity.id || entity.type}_${entity.x}_${entity.y}"]`);
    // AI: For world objects and enemies, we might need a simpler ID if their DOM elements are not tied to coords.
    if (!element && (type === 'worldObject' || type === 'enemy')) {
      element = document.querySelector(`.${domClass}[${keyAttribute}="${entity.id}"]`);
    }

    if (!element || element.classList.contains('hidden')) return null;

    // AI: Check if mouse is over the DOM element's *visual* bounds.
    // This is crucial for precise interaction.
    const elementRect = element.getBoundingClientRect();
    const isMouseOverElement =
      screenMouseX >= elementRect.left &&
      screenMouseX <= elementRect.right &&
      screenMouseY >= elementRect.top &&
      screenMouseY <= elementRect.bottom;

    if (isMouseOverElement) {
      // AI: Also check the distance in world coordinates to ensure it's within interaction range.
      const dist = Math.hypot(game.player.x - entity.x, game.player.y - entity.y);
      if (dist <= interactionRadius) {
        return element;
      }
    }
    return null;
  };

  try {
    // AI: Iterate through enemies first, as they are a primary interaction target for combat.
    for (const enemy of getEnemies()) {
      const enemyElement = checkHover(enemy, 'enemy', 'enemy-sprite'); // Assuming enemies have a 'enemy-sprite' class on their DOM elements
      if (enemyElement) {
        hoveredElement = enemyElement;
        hoveredEntity = enemy;
        hoverType = 'enemy';
        break; // Only highlight one enemy
      }
    }

    // AI: If no enemy is hovered, check resource nodes.
    if (!hoveredElement) {
      for (const node of game.resourceNodes) {
        const nodeElement = checkHover(node, 'resourceNode', 'resource-node');
        if (nodeElement) {
          hoveredElement = nodeElement;
          hoveredEntity = node;
          hoverType = 'resourceNode';
          break; // Only highlight one node
        }
      }
    }

    // AI: If no resource node is hovered, check world objects.
    if (!hoveredElement) {
        // AI: Check world objects (e.g., market, portals)
        for (const object of worldObjects) {
            const objectElement = checkHover(object, 'worldObject', 'world-object-icon'); // Assuming world objects have a 'world-object-icon' class
            if (objectElement) {
                hoveredElement = objectElement;
                hoveredEntity = object;
                hoverType = 'worldObject';
                break;
            }
        }
    }

    // AI: If no world object is hovered, check ground items.
    if (!hoveredElement) {
      for (const item of game.groundItems) {
        const itemElement = checkHover(item, 'groundItem', 'ground-item');
        if (itemElement) {
          hoveredElement = itemElement;
          hoveredEntity = item;
          hoverType = 'groundItem';
          break; // Only highlight one item
        }
      }
    }
    
    // AI: If there was a previously hovered element and it's no longer the current hovered element,
    // remove its highlight. This ensures only one element is highlighted at a time.
    if (game._lastDomHintEl && game._lastDomHintEl !== hoveredElement) {
      game._lastDomHintEl.dataset.highlighted = 'false';
      game._lastDomHintEl.classList.remove('highlighted-border'); // AI: Remove CSS highlight class
      // AI: Dispatch a custom event to notify canvas elements to remove their outline.
      game.canvas.dispatchEvent(new CustomEvent('remove-entity-outline', { detail: { element: game._lastDomHintEl } }));
    }

    // AI: Apply highlighting to the newly hovered element if a valid one was found.
    // The highlight now uses the canvas-drawn precise outline.
    if (hoveredElement && hoveredElement !== game._lastDomHintEl) {
      hoveredElement.dataset.highlighted = 'true';
      hoveredElement.classList.add('highlighted-border'); // AI: Add CSS highlight class for general styling
      // AI: Dispatch a custom event to notify canvas elements to draw their outline.
      game.canvas.dispatchEvent(new CustomEvent('draw-entity-outline', { detail: { entity: hoveredEntity, type: hoverType, element: hoveredElement } }));
    }

    // AI: Update the reference to the last hovered element.
    game._lastDomHintEl = hoveredElement;

  } catch (error) {
    console.warn('Error in renderDomGroundItemHint:', error);
  }
}

export function ensureNameTagsOverlay() {
  const desktop = document.getElementById('desktop-screen');
  if (!desktop) return null;
  let overlay = document.getElementById('name-tags');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'name-tags';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '30';
    desktop.appendChild(overlay);
  }
  return overlay;
}

// AI: The ensureInteractionOverlay and renderInteractionPromptDOM functions have been removed
// as per user request to eliminate the 'E' key interaction functionality.
// This simplifies the UI logic and removes unnecessary DOM manipulation.

// AI: The 'game' import is already at the top of the file, so this duplicate import is removed.
// import { game } from './core.js';
// AI: The 'updateAreaPlayer' import is already handled by the new 'sendGlobalMessage' and 'setTypingStatus' functions.
import { updateAreaPlayer } from '../services/realtimePosition.js';

export function drawActionStatus() {
  // This function is intentionally left blank as per the original code.
  // It's a placeholder for future action status drawing.
}

/**
 * AI: Sends a global chat message from the current player.
 * This function updates the player's data in the real-time database with the message content.
 * It also sets a 'typing' status to false, indicating the player has finished typing.
 * @param {string} message - The message content to send.
 */
import { sendChatMessage } from '../services/firestoreService.js';
import { auth } from '../utils/firebaseClient.js';
import { gameState } from '../app/state.js';
import { multiplayerManager } from './multiplayerManager.js';

export function sendGlobalMessage(message) {
  // AI: Use multiplayerManager instead of removed game.mp structure
  const localPlayer = multiplayerManager.getLocalPlayer();
  if (!localPlayer.uid || !localPlayer.areaId) {
    console.warn('Cannot send message: Player UID or Area ID not available.');
    return;
  }
  // AI: Update the player's data in the database with the chat message and set typing to false.
  // Using 'chat' field for consistency with multiplayerManager's showPlayerChat() function.
  // The message will be picked up by other clients via the subscribeAreaPlayers listener.
  updateAreaPlayer(localPlayer.areaId, localPlayer.uid, { chat: message, typing: false });
  const user = auth.currentUser;
  if (user) {
    sendChatMessage(message, user, gameState.username);
  }
}

/**
 * AI: Updates the player's typing status in the real-time database.
 * This function sets the 'typing' property to true or false based on the input.
 * @param {boolean} isTyping - True if the player is currently typing, false otherwise.
 */
export function setTypingStatus(isTyping) {
  // AI: Use multiplayerManager instead of removed game.mp structure
  const localPlayer = multiplayerManager.getLocalPlayer();
  if (!localPlayer.uid || !localPlayer.areaId) {
    console.warn('Cannot set typing status: Player UID or Area ID not available.');
    return;
  }
  // AI: Update the player's data in the database with the typing status.
  updateAreaPlayer(localPlayer.areaId, localPlayer.uid, { typing: isTyping });
}

