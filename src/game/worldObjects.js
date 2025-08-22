import { game } from './core.js';
import { highlightManager } from './highlightManager.js';

/**
 * AI: World Objects System
 * Handles interactable objects placed in the game world
 */

/**
 * AI: Updates the game object's worldObjects array for DOM rendering.
 * This ensures the renderWorldObjectsAsDOM function has access to current world object data.
 */
function updateGameWorldObjects() {
  // Update game object with current world objects for DOM rendering
  game.worldObjects = [...worldObjects];
}

// AI: World objects storage
export const worldObjects = [];

/**
 * AI: Create a market stall object
 */

/**
 * AI: Initialize world objects
 */
export function initWorldObjects() {
  // AI: Clear existing objects
  worldObjects.length = 0;

  // AI: Place market stall in a good location (center-right area)
  const marketStall = {
    id: 'market_stall_1',
    type: 'market',
    x: 600, // Center-right area
    y: 300,
    width: 32,
    height: 32,
    interactionRadius: 35,
    action: 'Trade',
    onInteract: () => {
      console.log('Market stall interaction triggered');
      // TODO: Implement market interface
    }
  };

  worldObjects.push(marketStall);

  console.log(`Initialized ${worldObjects.length} world objects`);

  // AI: Update game object with world objects for DOM rendering
  updateGameWorldObjects();
}

/**
 * AI: Draw a simple pixelated floating terminal
 */
function drawMarketIcon(ctx, x, y, size = 48) {
  const halfSize = size / 2;
  
  // AI: Save context state
  ctx.save();
  
  // AI: Simple shadow on ground
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x - 12, y + halfSize + 4, 24, 4);
  
  // AI: Main terminal body (simple gray box)
  ctx.fillStyle = '#708090';
  ctx.fillRect(x - 16, y - 12, 32, 24);
  
  // AI: Simple screen (cyan square)
  ctx.fillStyle = '#00FFFF';
  ctx.fillRect(x - 12, y - 8, 24, 16);
  
  // AI: Screen border
  ctx.fillStyle = '#2F4F4F';
  ctx.strokeRect(x - 12, y - 8, 24, 16);
  
  // AI: Two simple lights
  ctx.fillStyle = '#00FF00'; // Green
  ctx.fillRect(x - 6, y - 18, 4, 4);
  
  ctx.fillStyle = '#FF0000'; // Red  
  ctx.fillRect(x + 2, y - 18, 4, 4);
  
  // AI: Simple base hover effect (just colored rectangles)
  ctx.fillStyle = '#FF69B4'; // Pink energy
  ctx.fillRect(x - 8, y + 8, 4, 4);
  ctx.fillRect(x + 4, y + 8, 4, 4);
  
  ctx.restore();
}

/**
 * AI: Draw all world objects
 */
export function drawWorldObjects() {
  const { ctx } = game;
  if (!ctx) return;
  
  const interactionRadius = 35;
  
  for (const obj of worldObjects) {
    // AI: Draw the object based on its type
    switch (obj.type) {
      case 'market':
        drawMarketIcon(ctx, obj.x, obj.y, obj.width);
        break;
      default:
        // AI: Fallback generic object
        ctx.fillStyle = '#666';
        ctx.fillRect(obj.x - obj.width/2, obj.y - obj.height/2, obj.width, obj.height);
        break;
    }
    
    // AI: Show interaction hint when player is nearby
    const distance = Math.hypot(obj.x - game.player.x, obj.y - game.player.y);
    if (distance <= obj.interactionRadius) {
      // AI: Draw simple interaction outline around object
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'; // Sky blue
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); // Dashed line
      ctx.strokeRect(obj.x - obj.width/2 - 2, obj.y - obj.height/2 - 2, obj.width + 4, obj.height + 4);
      ctx.setLineDash([]); // Reset line dash
      ctx.restore();

      // AI: Draw action prompt above object
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(obj.x - 30, obj.y - obj.height/2 - 25, 60, 16);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`E - ${obj.action}`, obj.x, obj.y - obj.height/2 - 17);
      ctx.restore();
    }

    // Add highlight support using highlightManager
    if (highlightManager.isHighlighted(obj)) {
      // Draw glowing highlight outline around object
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'; // Gold color for highlight
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.strokeRect(obj.x - obj.width/2 - 3, obj.y - obj.height/2 - 3, obj.width + 6, obj.height + 6);
      ctx.restore();
    }
  }
}

/**
 * AI: Check for interaction with world objects
 */
export function checkWorldObjectInteraction() {
  for (const obj of worldObjects) {
    const distance = Math.hypot(obj.x - game.player.x, obj.y - game.player.y);
    if (distance <= obj.interactionRadius) {
      // AI: Execute the object's interaction
      if (obj.onInteract) {
        obj.onInteract();
        return true; // Interaction handled
      }
    }
  }
  
  return false; // No interaction
}

/**
 * AI: Get nearest world object to player
 */
export function getNearestWorldObject() {
  let nearest = null;
  let nearestDistance = Infinity;
  
  for (const obj of worldObjects) {
    const distance = Math.hypot(obj.x - game.player.x, obj.y - game.player.y);
    if (distance < nearestDistance && distance <= obj.interactionRadius) {
      nearest = obj;
      nearestDistance = distance;
    }
  }
  
  return nearest;
}