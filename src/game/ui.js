// In‑game HUD drawing (toasts, prompts, progress bars)
// TOOLTIP FUNCTIONALITY REMOVED: All DOM-based tooltips eliminated per user request
// Canvas-based highlighting via highlightManager is now the only visual feedback mechanism
// Right-click functionality preserved for game interactions
import { game } from './core.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { drawPixelIcon, drawOutline, getItemBounds, isPointInItemBounds } from '../data/pixelIcons.js';
import { getNearestWorldObject, worldObjects } from './worldObjects.js';
import { getEnemies } from './enemies.js'; // AI: Import getEnemies to access enemy list
import { INTERACTION_RADIUS } from '../utils/constants.js'; // AI: Import INTERACTION_RADIUS constant
// DOM tooltip utilities removed - no longer needed with canvas-only highlighting
// ensureTooltipOverlay, showInventoryTooltip, hideInventoryTooltip eliminated
import { camera } from './world.js'; // AI: Import camera for coordinate conversion

// Global variables for tooltip management - REMOVED
// Tooltip functionality eliminated per user request
// Canvas-based highlighting handles all visual feedback

/**
 * Initialize event listeners for highlight events from the highlight manager
 * Sets up listeners for 'highlight-changed' and 'highlight-cleared' events on the canvas
 * Note: Tooltip functionality removed - only canvas-based highlighting remains
 */
export function initHighlightEventListeners() {
  if (!game.canvas) {
    console.warn('Cannot initialize highlight event listeners: Canvas not available');
    return;
  }

  // Remove any existing listeners to avoid duplicates
  game.canvas.removeEventListener('highlight-changed', handleHighlightChanged);
  game.canvas.removeEventListener('highlight-cleared', handleHighlightCleared);

  // Add event listeners for highlight events
  game.canvas.addEventListener('highlight-changed', handleHighlightChanged);
  game.canvas.addEventListener('highlight-cleared', handleHighlightCleared);

  console.log('Highlight event listeners initialized');
}

/**
 * Handle highlight-changed events from the highlight manager
 * Tooltip functionality removed - only canvas-based highlighting remains
 * Event handlers kept for potential future use but currently no-op
 */
function handleHighlightChanged(event) {
  // Tooltip functionality removed per user request
  // Canvas-based highlighting is handled by individual render functions
  // This handler is kept for event listener consistency but performs no action
}

/**
 * Handle highlight-cleared events from the highlight manager
 * Tooltip functionality removed - only canvas-based highlighting remains
 */
function handleHighlightCleared(event) {
  // Tooltip functionality removed per user request
  // Canvas-based highlighting is handled by individual render functions
  // This handler is kept for event listener consistency but performs no action
}

/**
 * Show tooltip for a highlighted entity
 * REMOVED: Tooltip functionality eliminated per user request
 * Canvas-based highlighting is now the only visual feedback mechanism
 */
function showEntityTooltip(entity, type) {
  // Tooltip functionality removed - no DOM elements created for tooltips
  // Canvas-based highlighting handled by individual render functions
}

/**
 * Hide the current entity tooltip
 * REMOVED: Tooltip functionality eliminated per user request
 */
function hideEntityTooltip() {
  // Tooltip functionality removed - no DOM elements to hide
  // Canvas-based highlighting is self-contained within render functions
}

/**
 * Show entity tooltip at specific position
 * REMOVED: DOM tooltip functionality eliminated per user request
 * Canvas-based highlighting provides all necessary visual feedback
 */
function showEntityTooltipAtPosition(content, entityScreenX, entityScreenY) {
  // DOM tooltip functionality removed - no DOM elements created
  // Canvas-based highlighting is handled by individual render functions
  // This function kept for compatibility but performs no action
}

/**
 * Ensure name tags overlay exists
 * REMOVED: DOM overlay functionality eliminated per user request
 * Canvas-based rendering handles all visual elements
 */
export function ensureNameTagsOverlay() {
  // DOM overlay functionality removed - no DOM elements created
  // Canvas-based rendering is used for all game elements
  // This function kept for compatibility but returns null
  return null;
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

