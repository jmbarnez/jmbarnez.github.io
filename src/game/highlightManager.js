/**
 * HighlightManager - Singleton module for managing interactive entity highlighting
 *
 * This module provides a clean separation between game engine concerns and UI highlighting.
 * It tracks which entity (if any) is currently highlighted based on mouse position and
 * provides a simple API for rendering functions to query highlight state.
 *
 * Priority Order for Entity Scanning:
 * 1. Enemies (highest priority - combat interactions)
 * 2. Resource Nodes (harvesting interactions)
 * 3. World Objects (special interactions like markets)
 * 4. Ground Items (pickup interactions)
 *
 * @singleton
 * @module HighlightManager
 */

import { screenToWorldCoords } from '../utils/math.js';
import { camera } from './world.js';
import { game } from './core.js';
import { INTERACTION_RADIUS } from '../utils/constants.js';

/**
 * HighlightManager singleton instance
 * @private
 */
let instance = null;

/**
 * HighlightManager class - handles entity highlighting logic
 * @class
 */
class HighlightManager {
  constructor() {
    // Prevent multiple instances
    if (instance) {
      return instance;
    }

    /**
     * Currently highlighted entity and its type
     * @type {Object|null}
     * @property {Object|null} entity - The highlighted entity object
     * @property {string|null} type - The type of entity ('enemy', 'resourceNode', 'worldObject', 'groundItem')
     */
    this.currentHighlight = {
      entity: null,
      type: null
    };

    /**
     * Canvas element reference
     * @type {HTMLCanvasElement|null}
     */
    this.canvas = null;

    /**
     * Mouse move event handler bound to this instance
     * @type {Function}
     * @private
     */
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);

    instance = this;
  }

  /**
   * Initialize the highlight manager with a canvas element
   * Sets up mouse tracking and event listeners
   *
   * @param {HTMLCanvasElement} canvas - The game canvas element
   * @throws {Error} If canvas is not provided or not a valid canvas element
   */
  init(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('HighlightManager: Valid canvas element required for initialization');
    }

    this.canvas = canvas;

    // Add mousemove event listener to track mouse position
    // Using mousemove instead of mouseover for more precise tracking
    canvas.addEventListener('mousemove', this.boundHandleMouseMove);

    console.log('HighlightManager: Initialized successfully');
  }

  /**
   * Clean up event listeners and reset state
   * Should be called when leaving the game area or shutting down
   */
  cleanup() {
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
      this.canvas = null;
    }

    // Clear current highlight and dispatch cleared event
    if (this.currentHighlight.entity) {
      this.currentHighlight.entity = null;
      this.currentHighlight.type = null;
      this.dispatchHighlightCleared();
    }

    console.log('HighlightManager: Cleanup completed');
  }

  /**
   * Handle mouse move events on the canvas
   * Converts screen coordinates to world coordinates and scans for highlighted entities
   *
   * @param {MouseEvent} event - The mouse move event
   * @private
   */
  handleMouseMove(event) {
    if (!this.canvas || !camera) {
      return;
    }

    // Get canvas bounding rectangle for coordinate conversion
    const rect = this.canvas.getBoundingClientRect();

    // Calculate scaling factors for high-DPI displays
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    // Convert screen coordinates to canvas coordinates
    const screenX = (event.clientX - rect.left) * scaleX;
    const screenY = (event.clientY - rect.top) * scaleY;

    // Convert screen coordinates to world coordinates using camera transform
    const worldCoords = screenToWorldCoords(screenX, screenY, camera);

    if (!worldCoords) {
      // Mouse is outside the world bounds, clear any existing highlight
      this.clearHighlight();
      return;
    }

    // Scan for entities at the mouse position
    const highlightedEntity = this.scanEntitiesAtPosition(worldCoords.x, worldCoords.y);

    // Update highlight state if it changed
    if (this.hasHighlightChanged(highlightedEntity)) {
      this.updateHighlight(highlightedEntity);
    }
  }

  /**
   * Scan all entity types at the given world position to find the highlighted entity
   * Uses priority order: enemies -> resource nodes -> world objects -> ground items
   *
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object|null} Object with entity and type, or null if no entity found
   * @private
   */
  scanEntitiesAtPosition(worldX, worldY) {
    // DISABLED: Enemy system is disabled - no enemy scanning
    /*
    // Priority 1: Scan enemies first (combat interactions take precedence)
    const enemy = this.findNearestEnemy(worldX, worldY);
    if (enemy) {
      return { entity: enemy, type: 'enemy' };
    }
    */

    // Priority 2: Scan resource nodes (harvesting interactions)
    const resourceNode = this.findNearestResourceNode(worldX, worldY);
    if (resourceNode) {
      return { entity: resourceNode, type: 'resourceNode' };
    }

    // Priority 3: Scan world objects (special interactions)
    const worldObject = this.findNearestWorldObject(worldX, worldY);
    if (worldObject) {
      return { entity: worldObject, type: 'worldObject' };
    }

    // Priority 4: Scan ground items (pickup interactions)
    const groundItem = this.findNearestGroundItem(worldX, worldY);
    if (groundItem) {
      return { entity: groundItem, type: 'groundItem' };
    }

    // No entity found at this position
    return null;
  }

  /**
   * DISABLED: Enemy system is disabled - findNearestEnemy method removed
   * @private
   */
  /*
  findNearestEnemy(worldX, worldY) {
    if (!game.enemies || game.enemies.length === 0) {
      return null;
    }

    let nearestEnemy = null;
    let minDistance = Infinity;

    for (const enemy of game.enemies) {
      // Skip dead enemies - they shouldn't be highlightable
      if (enemy.isDead || enemy.hp <= 0) {
        continue;
      }

      // Calculate distance from mouse to enemy center
      const distance = Math.hypot(enemy.x - worldX, enemy.y - worldY);

      // Use enemy size as the interaction radius for more accurate detection
      // This accounts for different enemy sizes (small vs large enemies)
      const enemyRadius = enemy.size || 4; // Fallback to default size

      if (distance <= enemyRadius && distance < minDistance) {
        nearestEnemy = enemy;
        minDistance = distance;
      }
    }

    return nearestEnemy;
  }
  */

  /**
   * Find the nearest resource node within interaction range
   * Uses fixed interaction radius optimized for resource nodes
   *
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object|null} Nearest resource node or null if none in range
   * @private
   */
  findNearestResourceNode(worldX, worldY) {
    if (!game.resourceNodes || game.resourceNodes.length === 0) {
      return null;
    }

    let nearestNode = null;
    let minDistance = Infinity;

    // Resource nodes use a fixed interaction radius of 24 pixels
    // This is optimized for their visual size and interaction requirements
    const RESOURCE_NODE_INTERACTION_RADIUS = 24;

    for (const node of game.resourceNodes) {
      const distance = Math.hypot(node.x - worldX, node.y - worldY);

      if (distance <= RESOURCE_NODE_INTERACTION_RADIUS && distance < minDistance) {
        nearestNode = node;
        minDistance = distance;
      }
    }

    return nearestNode;
  }

  /**
   * Find the nearest world object within interaction range
   * Uses the object's own interactionRadius property for accurate detection
   *
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object|null} Nearest world object or null if none in range
   * @private
   */
  findNearestWorldObject(worldX, worldY) {
    if (!game.worldObjects || game.worldObjects.length === 0) {
      return null;
    }

    let nearestObject = null;
    let minDistance = Infinity;

    for (const obj of game.worldObjects) {
      const distance = Math.hypot(obj.x - worldX, obj.y - worldY);

      // Use the object's own interaction radius, with fallback to INTERACTION_RADIUS
      const interactionRadius = obj.interactionRadius || INTERACTION_RADIUS;

      if (distance <= interactionRadius && distance < minDistance) {
        nearestObject = obj;
        minDistance = distance;
      }
    }

    return nearestObject;
  }

  /**
   * Find the nearest ground item within interaction range
   * Uses INTERACTION_RADIUS for pickup range detection
   *
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object|null} Nearest ground item or null if none in range
   * @private
   */
  findNearestGroundItem(worldX, worldY) {
    if (!game.groundItems || game.groundItems.length === 0) {
      return null;
    }

    let nearestItem = null;
    let minDistance = Infinity;

    // Ground items use the standard interaction radius
    // This ensures consistency with other pickup mechanics
    const GROUND_ITEM_INTERACTION_RADIUS = INTERACTION_RADIUS;

    for (const item of game.groundItems) {
      // Skip items that are marked for collection
      if (item._collected) {
        continue;
      }

      const distance = Math.hypot(item.x - worldX, item.y - worldY);

      if (distance <= GROUND_ITEM_INTERACTION_RADIUS && distance < minDistance) {
        nearestItem = item;
        minDistance = distance;
      }
    }

    return nearestItem;
  }

  /**
   * Check if the highlight state has changed compared to the current highlight
   *
   * @param {Object|null} newHighlight - New highlight object with entity and type
   * @returns {boolean} True if the highlight has changed
   * @private
   */
  hasHighlightChanged(newHighlight) {
    const current = this.currentHighlight;

    // If both are null, no change
    if (!current.entity && !newHighlight) {
      return false;
    }

    // If one is null and the other isn't, it's a change
    if (!current.entity || !newHighlight) {
      return true;
    }

    // If entity references are different, it's a change
    if (current.entity !== newHighlight.entity) {
      return true;
    }

    // If types are different, it's a change
    if (current.type !== newHighlight.type) {
      return true;
    }

    // No change detected
    return false;
  }

  /**
   * Update the current highlight state and dispatch appropriate events
   *
   * @param {Object|null} newHighlight - New highlight object with entity and type
   * @private
   */
  updateHighlight(newHighlight) {
    const previousHighlight = { ...this.currentHighlight };

    // Update current highlight
    if (newHighlight) {
      this.currentHighlight.entity = newHighlight.entity;
      this.currentHighlight.type = newHighlight.type;
    } else {
      this.currentHighlight.entity = null;
      this.currentHighlight.type = null;
    }

    // Dispatch events based on the change
    if (previousHighlight.entity && !newHighlight) {
      // Highlight was cleared
      this.dispatchHighlightCleared(previousHighlight);
    } else if (!previousHighlight.entity && newHighlight) {
      // New highlight was set
      this.dispatchHighlightChanged(newHighlight);
    } else if (previousHighlight.entity && newHighlight &&
               (previousHighlight.entity !== newHighlight.entity ||
                previousHighlight.type !== newHighlight.type)) {
      // Highlight changed from one entity to another
      this.dispatchHighlightChanged(newHighlight, previousHighlight);
    }
  }

  /**
   * Clear the current highlight
   * @private
   */
  clearHighlight() {
    this.updateHighlight(null);
  }

  /**
   * Dispatch highlight-changed event on the canvas
   *
   * @param {Object} newHighlight - The new highlight object
   * @param {Object} [previousHighlight] - The previous highlight object (optional)
   * @private
   */
  dispatchHighlightChanged(newHighlight, previousHighlight = null) {
    if (!this.canvas) {
      return;
    }

    const event = new CustomEvent('highlight-changed', {
      detail: {
        entity: newHighlight.entity,
        type: newHighlight.type,
        previousEntity: previousHighlight ? previousHighlight.entity : null,
        previousType: previousHighlight ? previousHighlight.type : null
      },
      bubbles: true
    });

    this.canvas.dispatchEvent(event);
  }

  /**
   * Dispatch highlight-cleared event on the canvas
   *
   * @param {Object} [previousHighlight] - The previous highlight object (optional)
   * @private
   */
  dispatchHighlightCleared(previousHighlight = null) {
    if (!this.canvas) {
      return;
    }

    const event = new CustomEvent('highlight-cleared', {
      detail: {
        previousEntity: previousHighlight ? previousHighlight.entity : null,
        previousType: previousHighlight ? previousHighlight.type : null
      },
      bubbles: true
    });

    this.canvas.dispatchEvent(event);
  }

  /**
   * Check if a specific entity is currently highlighted
   * This method is used by rendering functions to determine if an entity should be visually highlighted
   *
   * @param {Object} entity - The entity to check
   * @returns {boolean} True if the entity is currently highlighted
   *
   * @example
   * // In a rendering function:
   * if (highlightManager.isHighlighted(enemy)) {
   *   // Draw highlight effect around the enemy
   *   drawEnemyHighlight(enemy);
   * }
   */
  isHighlighted(entity) {
    // Return false if no current highlight
    if (!this.currentHighlight.entity) {
      return false;
    }

    // Return true if the entity matches the currently highlighted entity
    return this.currentHighlight.entity === entity;
  }

  /**
   * Get the currently highlighted entity and its type
   * Useful for debugging or for components that need to know what is highlighted
   *
   * @returns {Object|null} Object with entity and type, or null if nothing highlighted
   */
  getCurrentHighlight() {
    if (!this.currentHighlight.entity) {
      return null;
    }

    return {
      entity: this.currentHighlight.entity,
      type: this.currentHighlight.type
    };
  }

  /**
   * Get the type of the currently highlighted entity
   * Convenience method for when you only need the type
   *
   * @returns {string|null} The entity type or null if nothing highlighted
   */
  getCurrentHighlightType() {
    return this.currentHighlight.type;
  }
}

// Export singleton instance
export const highlightManager = new HighlightManager();