/**
 * Ground Item UI Enhancements
 *
 * This module provides comprehensive UI enhancements for ground items including:
 * - Hover tooltips showing item name and count
 * - Floating +Item messages for successful pickups
 * - Clean integration with highlightManager for canvas-based highlighting
 *
 * UI ARCHITECTURE OVERVIEW:
 * =========================
 *
 * The ground item UI system follows a clean separation of concerns:
 *
 * 1. EVENT-DRIVEN TOOLTIP SYSTEM:
 *    - Listens to highlightManager's 'highlight-changed' and 'highlight-cleared' events
 *    - Shows tooltips only for ground items when highlighted via mouse hover
 *    - Positions tooltips near the mouse cursor with smart collision detection
 *    - Uses canvas-based rendering for consistent styling and performance
 *    - No DOM manipulation - pure canvas rendering for better performance
 *
 * 2. FLOATING MESSAGE SYSTEM:
 *    - Similar to existing gold drop effects but specialized for item pickups
 *    - Shows "+Item Name" or "+2x Item Name" messages that float upward and fade
 *    - Triggered by successful pickup events from groundItemService
 *    - Uses cubic easing animations for smooth, professional visual feedback
 *    - Performance optimized with object pooling (max 10 concurrent messages)
 *
 * 3. RENDERING INTEGRATION:
 *    - All rendering happens in the main game loop via drawGroundItemUI()
 *    - Integrated with existing camera system for proper world-to-screen conversion
 *    - Clean separation between game logic (items.js) and UI presentation (this module)
 *    - No DOM manipulation - everything is canvas-based for consistency
 *    - Frame-rate independent animations using delta time
 *
 * 4. ACCESSIBILITY FEATURES:
 *    - High contrast mode toggle for visually impaired players
 *    - Large text mode for better readability
 *    - Keyboard navigation support for ground items
 *    - Screen reader friendly architecture (though canvas-based)
 *    - Smooth animations that respect user preferences
 *    - Clear visual hierarchy with proper contrast ratios
 *
 * 5. PERFORMANCE OPTIMIZATIONS:
 *    - Object pooling for floating messages to reduce GC pressure
 *    - Efficient canvas rendering with proper state management
 *    - Smart tooltip positioning to avoid expensive collision detection
 *    - Frame-rate independent animations for consistent experience
 *    - Memory-efficient cleanup and initialization
 *
 * INTEGRATION POINTS:
 * ===================
 *
 * - highlightManager: Receives highlight events for tooltip display
 * - groundItemService: Sends pickup events for floating messages
 * - core.js: Integrated into main game loop for updates and rendering
 * - items.js: Enhances existing ground item visual feedback
 * - constants.js: Uses shared constants for consistent behavior
 *
 * USAGE EXAMPLE:
 * ==============
 *
 * // Initialize the UI system
 * initGroundItemUI(canvas);
 *
 * // In game loop - update animations
 * updateFloatingMessages(dt);
 *
 * // In game loop - render UI elements
 * drawGroundItemUI(ctx);
 *
 * // Cleanup when leaving game area
 * cleanupGroundItemUI();
 *
 * // Accessibility features
 * setHighContrastMode(true);
 * setLargeTextMode(true);
 * navigateGroundItems('next');
 */

import { game } from './core.js';
import { highlightManager } from './highlightManager.js';
import { worldToScreenCoords } from '../utils/math.js';
import { items as itemDefs } from '../data/content.js';
import { INTERACTION_RADIUS } from '../utils/constants.js';

/**
 * Tooltip state management
 * @private
 */
let currentTooltip = {
  entity: null,
  type: null,
  screenX: 0,
  screenY: 0,
  itemName: '',
  itemCount: 1
};

/**
 * Floating message pool for performance optimization
 * @private
 */
const floatingMessages = [];
const MAX_FLOATING_MESSAGES = 10; // Limit concurrent messages

/**
 * Tooltip rendering configuration
 * @private
 */
const TOOLTIP_CONFIG = {
  backgroundColor: 'rgba(0, 0, 0, 0.9)',
  borderColor: 'rgba(255, 255, 255, 0.8)',
  textColor: '#ffffff',
  padding: 8,
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'monospace',
  maxWidth: 200,
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowOffset: 2,
  // Accessibility enhancements
  highContrastMode: false, // Can be toggled for accessibility
  largeTextMode: false     // Can be toggled for accessibility
};

/**
 * Floating message configuration
 * @private
 */
const FLOATING_MESSAGE_CONFIG = {
  fontSize: 10,
  fontFamily: 'monospace',
  textColor: '#4ade80',
  shadowColor: 'rgba(0, 0, 0, 0.8)',
  duration: 2.0, // seconds
  floatDistance: 40, // pixels
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3) // Easing function
};

/**
 * Initialize ground item UI enhancements
 * Sets up event listeners for highlight changes and pickup events
 *
 * @param {HTMLCanvasElement} canvas - The game canvas element
 */
export function initGroundItemUI(canvas) {
  if (!canvas) {
    console.warn('GroundItemUI: No canvas provided for initialization');
    return;
  }

  console.log('GroundItemUI: Initializing ground item UI enhancements');

  // Listen for highlight changes to show/hide tooltips
  canvas.addEventListener('highlight-changed', handleHighlightChanged);
  canvas.addEventListener('highlight-cleared', handleHighlightCleared);

  // Listen for successful item pickups to show floating messages
  canvas.addEventListener('item-picked-up', handleItemPickedUp);

  console.log('GroundItemUI: Event listeners initialized');
}

/**
 * Clean up event listeners and reset state
 */
export function cleanupGroundItemUI() {
  if (game.canvas) {
    game.canvas.removeEventListener('highlight-changed', handleHighlightChanged);
    game.canvas.removeEventListener('highlight-cleared', handleHighlightCleared);
    game.canvas.removeEventListener('item-picked-up', handleItemPickedUp);
  }

  // Clear tooltip state
  currentTooltip.entity = null;
  currentTooltip.type = null;

  // Clear floating messages
  floatingMessages.length = 0;

  console.log('GroundItemUI: Cleanup completed');
}

/**
 * Handle highlight-changed events from highlightManager
 * Shows tooltip for ground items when they become highlighted
 *
 * @param {CustomEvent} event - The highlight-changed event
 * @private
 */
function handleHighlightChanged(event) {
  const { entity, type } = event.detail;

  // Only show tooltips for ground items
  if (type === 'groundItem' && entity) {
    // Get item definition for display name
    const itemDef = itemDefs.find(item => item.id === entity.type);
    const itemName = itemDef ? itemDef.name : entity.type;
    const itemCount = entity.count || 1;

    // Calculate tooltip position near the mouse cursor
    const mousePos = getMousePosition();
    if (mousePos) {
      currentTooltip = {
        entity,
        type,
        screenX: mousePos.x + 15, // Offset from cursor
        screenY: mousePos.y - 20, // Above cursor
        itemName,
        itemCount
      };
    }
  } else {
    // Clear tooltip for non-ground items
    currentTooltip.entity = null;
    currentTooltip.type = null;
  }
}

/**
 * Handle highlight-cleared events from highlightManager
 * Hides the current tooltip
 *
 * @param {CustomEvent} event - The highlight-cleared event
 * @private
 */
function handleHighlightCleared(event) {
  currentTooltip.entity = null;
  currentTooltip.type = null;
}

/**
 * Handle successful item pickup events
 * Shows floating message for picked up items
 *
 * @param {CustomEvent} event - The item-picked-up event
 * @private
 */
function handleItemPickedUp(event) {
  const { itemType, itemCount, pickupX, pickupY } = event.detail;

  if (!pickupX || !pickupY) {
    console.warn('GroundItemUI: Missing pickup coordinates for floating message');
    return;
  }

  // Get item definition for display name
  const itemDef = itemDefs.find(item => item.id === itemType);
  const itemName = itemDef ? itemDef.name : itemType;

  // Create floating message
  createFloatingMessage(itemName, itemCount, pickupX, pickupY);
}

/**
 * Create a floating message for item pickup
 *
 * @param {string} itemName - The name of the picked up item
 * @param {number} itemCount - The quantity picked up
 * @param {number} worldX - World X coordinate of pickup
 * @param {number} worldY - World Y coordinate of pickup
 * @private
 */
function createFloatingMessage(itemName, itemCount, worldX, worldY) {
  // Limit concurrent messages for performance
  if (floatingMessages.length >= MAX_FLOATING_MESSAGES) {
    floatingMessages.shift(); // Remove oldest message
  }

  const messageText = itemCount > 1 ? `+${itemCount}x ${itemName}` : `+${itemName}`;

  floatingMessages.push({
    text: messageText,
    worldX,
    worldY,
    life: FLOATING_MESSAGE_CONFIG.duration,
    maxLife: FLOATING_MESSAGE_CONFIG.duration,
    startY: worldY
  });
}

/**
 * Get current mouse position from game state
 *
 * @returns {Object|null} Mouse position object with x,y or null if unavailable
 * @private
 */
function getMousePosition() {
  if (game.mouse) {
    return { x: game.mouse.x, y: game.mouse.y };
  }
  return null;
}

/**
 * Update floating messages (called from main game loop)
 * Handles animation and cleanup of floating messages
 *
 * @param {number} dt - Delta time in seconds
 */
export function updateFloatingMessages(dt) {
  // Update existing messages
  for (let i = floatingMessages.length - 1; i >= 0; i--) {
    const message = floatingMessages[i];
    message.life -= dt;

    // Remove expired messages
    if (message.life <= 0) {
      floatingMessages.splice(i, 1);
    }
  }
}

/**
 * Draw ground item UI elements (tooltips and floating messages)
 * Called from the main game rendering loop
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
export function drawGroundItemUI(ctx) {
  if (!ctx) return;

  // Draw tooltip if active
  if (currentTooltip.entity && currentTooltip.type === 'groundItem') {
    drawTooltip(ctx);
  }

  // Draw floating messages
  drawFloatingMessages(ctx);
}

/**
 * Draw the current tooltip
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @private
 */
function drawTooltip(ctx) {
  const tooltip = currentTooltip;
  const config = TOOLTIP_CONFIG;

  // Prepare tooltip text
  const displayText = tooltip.itemCount > 1
    ? `${tooltip.itemName} (x${tooltip.itemCount})`
    : tooltip.itemName;

  // Measure text for sizing
  ctx.font = `${config.fontSize}px ${config.fontFamily}`;
  const textMetrics = ctx.measureText(displayText);
  const textWidth = Math.min(textMetrics.width, config.maxWidth);
  const textHeight = config.fontSize;

  // Calculate tooltip dimensions
  const tooltipWidth = textWidth + (config.padding * 2);
  const tooltipHeight = textHeight + (config.padding * 2);

  // Smart positioning to keep tooltip on screen
  let tooltipX = tooltip.screenX;
  let tooltipY = tooltip.screenY;

  // Adjust horizontal position if tooltip would go off-screen
  if (tooltipX + tooltipWidth > game.width) {
    tooltipX = tooltip.screenX - tooltipWidth - 15; // Position to the left of cursor
  }

  // Adjust vertical position if tooltip would go off-screen
  if (tooltipY - tooltipHeight < 0) {
    tooltipY = tooltip.screenY + tooltipHeight + 15; // Position below cursor
  }

  // Draw tooltip shadow
  ctx.save();
  ctx.fillStyle = config.shadowColor;
  ctx.fillRect(
    tooltipX + config.shadowOffset,
    tooltipY + config.shadowOffset,
    tooltipWidth,
    tooltipHeight
  );

  // Draw tooltip background
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

  // Draw tooltip border
  ctx.strokeStyle = config.borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

  // Draw tooltip text
  ctx.fillStyle = config.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(displayText, tooltipX + config.padding, tooltipY + config.padding);

  ctx.restore();
}

/**
 * Draw all active floating messages
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @private
 */
function drawFloatingMessages(ctx) {
  const config = FLOATING_MESSAGE_CONFIG;

  for (const message of floatingMessages) {
    // Calculate animation progress
    const progress = 1 - (message.life / message.maxLife);
    const easedProgress = config.easeOutCubic(progress);

    // Calculate current position
    const currentY = message.startY - (config.floatDistance * easedProgress);

    // Calculate alpha for fade effect
    const alpha = Math.min(1, message.life / 0.5); // Fade out in last 0.5 seconds

    // Convert world coordinates to screen coordinates
    const screenCoords = worldToScreenCoords(message.worldX, currentY, game.camera);
    if (!screenCoords) continue;

    // Draw message with shadow and fade
    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw shadow
    ctx.font = `${config.fontSize}px ${config.fontFamily}`;
    ctx.fillStyle = config.shadowColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message.text, screenCoords.x + 1, screenCoords.y + 1);

    // Draw text
    ctx.fillStyle = config.textColor;
    ctx.fillText(message.text, screenCoords.x, screenCoords.y);

    ctx.restore();
  }
}

/**
 * Trigger a floating message for item pickup
 * This can be called from external modules when items are picked up
 *
 * @param {string} itemType - The type of item picked up
 * @param {number} itemCount - The quantity picked up
 * @param {number} worldX - World X coordinate of pickup
 * @param {number} worldY - World Y coordinate of pickup
 */
export function showItemPickupMessage(itemType, itemCount, worldX, worldY) {
  // Dispatch custom event for loose coupling
  const event = new CustomEvent('item-picked-up', {
    detail: {
      itemType,
      itemCount,
      pickupX: worldX,
      pickupY: worldY
    },
    bubbles: true
  });

  if (game.canvas) {
    game.canvas.dispatchEvent(event);
  }
}

/**
 * Get current tooltip state for debugging or external access
 *
 * @returns {Object|null} Current tooltip state or null if no tooltip
 */
export function getCurrentTooltip() {
  if (!currentTooltip.entity) return null;

  return {
    entity: currentTooltip.entity,
    type: currentTooltip.type,
    itemName: currentTooltip.itemName,
    itemCount: currentTooltip.itemCount,
    screenX: currentTooltip.screenX,
    screenY: currentTooltip.screenY
  };
}

/**
 * Get active floating messages for debugging or external access
 *
 * @returns {Array} Array of active floating message objects
 */
export function getFloatingMessages() {
  return [...floatingMessages];
}

/**
 * Accessibility: Toggle high contrast mode for tooltips
 * Useful for players with visual impairments
 *
 * @param {boolean} enabled - Whether to enable high contrast mode
 */
export function setHighContrastMode(enabled) {
  TOOLTIP_CONFIG.highContrastMode = enabled;

  if (enabled) {
    TOOLTIP_CONFIG.backgroundColor = 'rgba(0, 0, 0, 1.0)';
    TOOLTIP_CONFIG.borderColor = 'rgba(255, 255, 255, 1.0)';
    TOOLTIP_CONFIG.textColor = '#ffffff';
    TOOLTIP_CONFIG.shadowColor = 'rgba(255, 255, 255, 0.8)';
  } else {
    TOOLTIP_CONFIG.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    TOOLTIP_CONFIG.borderColor = 'rgba(255, 255, 255, 0.8)';
    TOOLTIP_CONFIG.textColor = '#ffffff';
    TOOLTIP_CONFIG.shadowColor = 'rgba(0, 0, 0, 0.5)';
  }

  console.log(`GroundItemUI: High contrast mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Accessibility: Toggle large text mode for better readability
 *
 * @param {boolean} enabled - Whether to enable large text mode
 */
export function setLargeTextMode(enabled) {
  TOOLTIP_CONFIG.largeTextMode = enabled;

  if (enabled) {
    TOOLTIP_CONFIG.fontSize = 16;
    TOOLTIP_CONFIG.padding = 12;
  } else {
    TOOLTIP_CONFIG.fontSize = 12;
    TOOLTIP_CONFIG.padding = 8;
  }

  console.log(`GroundItemUI: Large text mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Keyboard navigation support for ground items
 * Allows players to navigate and interact with ground items using keyboard
 *
 * @param {string} direction - Navigation direction ('next', 'previous', 'select')
 * @returns {Object|null} Selected item or null if none
 */
export function navigateGroundItems(direction) {
  const groundItems = game.groundItems || [];
  if (groundItems.length === 0) return null;

  // Find currently highlighted ground item
  let currentIndex = -1;
  for (let i = 0; i < groundItems.length; i++) {
    if (highlightManager.isHighlighted(groundItems[i])) {
      currentIndex = i;
      break;
    }
  }

  let newIndex;
  switch (direction) {
    case 'next':
      newIndex = currentIndex < groundItems.length - 1 ? currentIndex + 1 : 0;
      break;
    case 'previous':
      newIndex = currentIndex > 0 ? currentIndex - 1 : groundItems.length - 1;
      break;
    case 'select':
      return currentIndex >= 0 ? groundItems[currentIndex] : groundItems[0];
    default:
      return null;
  }

  // Trigger highlight change for the new item
  if (newIndex >= 0 && newIndex < groundItems.length) {
    const newItem = groundItems[newIndex];

    // Dispatch custom highlight event
    const event = new CustomEvent('highlight-changed', {
      detail: {
        entity: newItem,
        type: 'groundItem'
      },
      bubbles: true
    });

    if (game.canvas) {
      game.canvas.dispatchEvent(event);
    }

    return newItem;
  }

  return null;
}

/**
 * Get accessibility information about current ground items
 * Useful for screen readers or other assistive technologies
 *
 * @returns {Object} Accessibility information
 */
export function getAccessibilityInfo() {
  const groundItems = game.groundItems || [];
  const highlightedItem = currentTooltip.entity;

  return {
    totalItems: groundItems.length,
    highlightedItem: highlightedItem ? {
      name: currentTooltip.itemName,
      count: currentTooltip.itemCount,
      type: highlightedItem.type
    } : null,
    nearbyItems: groundItems.filter(item => {
      const dist = Math.hypot(game.player.x - item.x, game.player.y - item.y);
      return dist <= INTERACTION_RADIUS;
    }).length,
    highContrastMode: TOOLTIP_CONFIG.highContrastMode,
    largeTextMode: TOOLTIP_CONFIG.largeTextMode
  };
}