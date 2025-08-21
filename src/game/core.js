// Main game loop (update/render orchestrator)
// AI: Updated imports to include the new camera and coordinate conversion functions.
import { isInWater, drawTerrain, camera } from './world.js';

import { playerService } from '../services/playerService.js';
import { spawnGroundItem, drawGroundItems } from './items.js';
import { harvestNode, drawResourceNodes, subscribeResourceNodes } from './resources.js';
import { addItemToInventory } from '../ui/inventory.js';
import { playPickupSound } from '../utils/sfx.js';
import { playMiningSound, startLaserSound, stopLaserSound, playCycleCompleteSound, playGunshotSound } from '../utils/sfx.js';
import { drawRemotePlayers, initNetwork } from './network.js';
import { multiplayerManager } from './multiplayerManager.js';
import { pingDisplay } from '../ui/pingDisplay.js';
import { experienceManager } from './experienceManager.js';
import { experienceBar } from '../ui/experienceBar.js';
import { drawPlayer, drawSelfMarker, drawMiningLaser, getMuzzlePosition } from './player.js';
import { renderDomGroundItemHint } from './ui.js';
import { worldToScreenCoords, screenToWorldCoords } from '../utils/math.js';
import { joinArea, subscribeAreaPlayers } from '../services/realtimePosition.js';
import { ACCELERATION, DECELERATION, GRAVITY, DAMPING_FACTOR, MAX_SPEED, DEAD_ZONE, DECEL_ZONE, ATTACK_RANGE, MUZZLE_OFFSET, DRONE_HEIGHT_OFFSET, FIRE_COOLDOWN, INTERACTION_RADIUS, AUTO_ATTACK_DURATION } from '../utils/constants.js';
import { isMouseOverItem, getItemBounds } from '../data/pixelIcons.js';
import { auth } from '../utils/firebaseClient.js';
import { gameState } from '../app/state.js';
import { areaData } from '../data/areaData.js';
import { initWorldObjects, drawWorldObjects, checkWorldObjectInteraction } from './worldObjects.js';
import { initEnemies, updateEnemies, drawEnemies, findNearestEnemy, setTargetedEnemy, getTargetedEnemy, getEnemies, cleanupEnemies } from './enemies.js';
import loadingScreen from '../utils/loadingScreen.js';
import { createProjectile, updateProjectiles, drawProjectiles, initProjectiles } from './projectiles.js';
import { waitForCanvas } from '../utils/domUtils.js';
import { initializeInteractiveHighlight, cleanupInteractiveHighlight } from '../utils/interactiveHighlight.js';
// AI: Removed complex MP constants - using simple multiplayer manager

export const game = {
  canvas: null,
  ctx: null,
  // AI: World size is now set dynamically based on the canvas's actual rendered size.
  // This ensures a 1:1 pixel mapping and a seamless, full-screen experience.
  WORLD_WIDTH: 0,
  WORLD_HEIGHT: 0,
  width: 0,
  height: 0,
  scale: 1, // Canvas scaling factor to fit screen
  // AI: Player's starting position is now set dynamically in the center of the world.
  player: { x: 0, y: 0, vx: 0, vy: 0, target: null, action: null, angle: 0, activeMiningNode: null, fireCooldown: 0, autoAttackTimer: 0 },
  lastTs: 0,
  timeAccumulator: 0, // AI: Accumulator for fixed-step game loop to handle tab focus loss.
  groundItems: [], // {x,y,type,harvest:0-1} - individual pickup items
  resourceNodes: [], // Shared nodes from RTDB: {id,x,y,type,cooldownUntil,...}
  enemies: [], // Active enemies from enemies.js
  worldObjects: [], // Active world objects from worldObjects.js
  inventory: { seashell: 0, driftwood: 0, seaweed: 0 },
  spawn: { max: 8, accumulator: 0 },
  // AI: Removed complex MP state - using multiplayerManager
  _lastDomHintEl: null,
  terrain: {}, // Initialize terrain object
  mouse: { x: 0, y: 0 }, // AI: Add mouse tracking for drone rotation
  isRightMouseDown: false, // AI: Track right mouse button state for hold-to-move
  targetMarker: null, // AI: Visual indicator for movement target
};

function update(dt) {
  const p = game.player;


  // AI: Drone Hovering Movement Mechanics
  // This section implements a physics-based movement system for a drone-like feel.
  // Instead of moving at a constant speed, the player accelerates towards the target
  // and decelerates with damping, creating a smooth "hovering" effect.

  // AI: Using shared movement constants to ensure all players move at the same speed

  // 1. Apply forces towards the target if one exists.
  if (p.target) {
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist > DEAD_ZONE || p.continuousMovement) {
      // Calculate direction unit vector
      const dirX = dx / dist;
      const dirY = dy / dist;
      
      // Apply acceleration force towards target
      let forceMultiplier = ACCELERATION;
      
      // For continuous movement, maintain constant speed
      if (p.continuousMovement) {
        // AI: Use a multiplier on the base acceleration for a more responsive feel
        // during continuous movement, avoiding hardcoded values.
        forceMultiplier = ACCELERATION * 1.1;
      } else {
        // AI: Use DECEL_ZONE for consistent braking behavior.
        if (dist < DECEL_ZONE) {
          const velocityTowardsTarget = (p.vx * dirX + p.vy * dirY);
          const proximityFactor = 1 - (dist / DECEL_ZONE);

          // AI: Apply braking force using the DECELERATION constant.
          if (velocityTowardsTarget > 0) {
            const brakeForce = DECELERATION * proximityFactor;
            p.vx -= dirX * brakeForce * dt;
            p.vy -= dirY * brakeForce * dt;
          }
        }
      }
      
      // Apply thrust towards target
      p.vx += dirX * forceMultiplier * dt;
      p.vy += dirY * forceMultiplier * dt;
    } else {
      // When the player is within the DEAD_ZONE and not in continuous movement mode,
      // snap to the target position and stop all movement. This prevents overshooting
      // and the "rubber-banding" effect.
      if (!p.continuousMovement) {
        p.x = p.target.x;
        p.y = p.target.y;
        p.vx = 0;
        p.vy = 0;
        p.target = null;
      }
    }
  }

  // 2. Apply gravity (if any).
  // For drones, GRAVITY is set to 0 in movementConstants.js, so this has no effect.
  // This line is kept for potential future use with other physics-based objects.
  p.vy += GRAVITY * dt;

  // 3. Apply air resistance/damping to simulate drag.
  // This gives the drone a "drifting" or "gliding" feel.
  // A DAMPING_FACTOR closer to 1 results in more drift, while a lower value
  // creates more "drag" and makes the drone stop more abruptly.
  p.vx *= DAMPING_FACTOR;
  p.vy *= DAMPING_FACTOR;


  // 4. Limit the player's velocity to MAX_SPEED.
  const currentSpeed = Math.hypot(p.vx, p.vy);
  if (currentSpeed > MAX_SPEED) {
    const speedRatio = MAX_SPEED / currentSpeed;
    p.vx *= speedRatio;
    p.vy *= speedRatio;
  }

  // 5. Update player position based on current velocity.
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // 6. Clamp player position to world boundaries and reset velocity if a boundary is hit.
  const PLAYER_RADIUS = 8;
  if (p.x < PLAYER_RADIUS) {
    p.x = PLAYER_RADIUS;
    p.vx = 0;
  } else if (p.x > game.WORLD_WIDTH - PLAYER_RADIUS) {
    p.x = game.WORLD_WIDTH - PLAYER_RADIUS;
    p.vx = 0;
  }
  if (p.y < PLAYER_RADIUS) {
    p.y = PLAYER_RADIUS;
    p.vy = 0;
  } else if (p.y > game.WORLD_HEIGHT - PLAYER_RADIUS) {
    p.y = game.WORLD_HEIGHT - PLAYER_RADIUS;
    p.vy = 0;
  }

  // 7. If velocity is negligible, set it to zero to prevent drifting.
  // Increased threshold to stop micro-movements that cause rocking
  if (Math.hypot(p.vx, p.vy) < 2) {
    p.vx = 0;
    p.vy = 0;
  }

  // 8. Continuously update player state for real-time saving.
  // This is now the primary way of saving position, replacing on-arrival saves.
  playerService.updateState({ x: p.x, y: p.y });

  // Remove any flagged ground items (picked up via E); no auto-harvest by proximity
  if (game.groundItems.some(n => n._collected)) {
    game.groundItems = game.groundItems.filter(n => !n._collected);
  }
  // Low spawn rate: try once per second with 20% chance if under max
  game.spawn.accumulator += dt;
  if (game.spawn.accumulator >= 1) {
    game.spawn.accumulator = 0;
    if (game.groundItems.length < game.spawn.max && Math.random() < 0.2) spawnGroundItem();
  }

  // Shared resource nodes: idle harvesting like sand mounds
  for (const node of game.resourceNodes) {
    if (!node.active) continue;
    
    // Stop if player moved away
    const dx = node.x - p.x;
    const dy = node.y - p.y;
    const near = Math.hypot(dx, dy) <= 24;
    if (!near) {
      node.active = false;
      // AI: If this was the currently active mining node, deactivate it
      // to stop the laser rendering.
      if (game.player.activeMiningNode && game.player.activeMiningNode.id === node.id) {
        game.player.activeMiningNode = null;
        stopLaserSound();
      }
      continue;
    }
    
    node.t = (node.t || 0) + dt;
    if (node.t >= 1.7) { // Reset cycle time
      node.t = 0; // Always reset timer to keep cycle going
      playCycleCompleteSound();
      
      const cooling = node.cooldownUntil && Date.now() < node.cooldownUntil;
      
      if (!cooling) {
        // Only attempt harvest if not on cooldown
        const areaId = 'beach';
        // AI: Get uid from multiplayerManager instead of removed game.mp
        const uid = multiplayerManager.isConnected() ? multiplayerManager.localPlayer.uid : null;
        if (uid) {
          const cooldownMs = node.type === 'stone_deposit' ? 3000 : 1500; // stone deposits take twice as long
          harvestNode(areaId, node.id, uid, cooldownMs).then((res) => {
            // res is now { committed, dropped, snapshot }
            if (res && res.committed) {
              if (res.dropped) {
                // Determine the correct item to drop based on the node type.
                const itemToDrop = node.type === 'stone_deposit' ? 'stone' : node.type;
                // Only play pickup sound if the item was actually added to inventory
                const added = addItemToInventory(itemToDrop, 1);
                if (added) {
                  playPickupSound();
                  playMiningSound();
                }

                // Experience handling: stone deposits yield 1 XP only and take longer
                if (node.type === 'stone_deposit') {
                  // Use addResourceExp so both global XP and per-skill XP update consistently.
                  experienceManager.addResourceExp('stone');
                } else {
                  experienceManager.addResourceExp(itemToDrop);
                }
              } else {
                // Transaction committed but no item dropped this cycle (progress increment only).
                // Do not show pickup notifications or sound; UI progress bar handles visual feedback.
              }
            }
            // Don't reset timer here - let the main loop handle it
          }).catch(() => {
            // Don't reset timer here - let the main loop handle it
          });
        }
      }
      // Timer always resets regardless of cooldown status to keep progress bar cycling
    }
  }

  // AI: Removed complex interpolation - using simple multiplayer manager

  // AI: Update multiplayer manager with current player position
  if (multiplayerManager.isConnected()) {
    const { x, y, action, angle, activeMiningNode } = game.player;
    const miningNodeId = activeMiningNode ? activeMiningNode.id : null;
    multiplayerManager.updateLocalPlayer(x, y, action, angle, miningNodeId);
    
    // AI: Update remote player positions with smooth interpolation
    multiplayerManager.updateRemotePlayerPositions();
    
    // AI: Update chat bubble positions for remote players
    multiplayerManager.updateChatPositions();
  }

  // AI: Update target marker fade effect
  if (game.targetMarker) {
    if (game.player.target) {
      // Keep marker alive while player has an active target
      game.targetMarker.life = game.targetMarker.maxLife;
    } else {
      // Fade out when no active target
      game.targetMarker.life -= dt;
      if (game.targetMarker.life <= 0) {
        game.targetMarker = null;
      }
    }
  }

  // AI: Smooth Drone Rotation
  // This section implements rotational damping for a more realistic drone feel.
  // Instead of instantly snapping to the cursor's direction, the drone smoothly
  // interpolates its angle towards the target angle.

  // 1. Calculate the target angle based on the cursor's position.
  let dx, dy, targetAngle;
  const targetedEnemy = getTargetedEnemy();
  if (targetedEnemy) {
      dx = targetedEnemy.x - p.x;
      dy = targetedEnemy.y - p.y;
      targetAngle = Math.atan2(dy, dx);
  } else {
      dx = game.mouse.x - p.x;
      dy = game.mouse.y - p.y;
      targetAngle = Math.atan2(dy, dx);
  }

  // 2. Smoothly interpolate the drone's current angle towards the target angle.
  // This creates a realistic rotational inertia effect.
  const ROTATION_SPEED = 7; // Adjust for faster or slower rotation.
  let angleDiff = targetAngle - p.angle;

  // 3. Normalize the angle difference to the range [-PI, PI].
  // This ensures the drone rotates along the shortest path.
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // 4. Apply the interpolation factor, making it frame-rate independent.
  // The drone's angle is updated by a fraction of the difference each frame.
  p.angle += angleDiff * (1 - Math.exp(-ROTATION_SPEED * dt));

  // AI: League of Legends-style Combat Logic with Auto-Attack System
  if (targetedEnemy) {
      // AI: Check if target is still alive and valid
      if (targetedEnemy.isDead || targetedEnemy.hp <= 0) {
          setTargetedEnemy(null);
          p.autoAttackTimer = 0;
      } else {
          // AI: Calculate distance accounting for drone height and enemy positioning
          const dx = targetedEnemy.x - p.x;
          const dy = (targetedEnemy.y - targetedEnemy.size) - (p.y - DRONE_HEIGHT_OFFSET); // Account for drone height
          const dist = Math.hypot(dx, dy);
          
          // AI: Only reset auto-attack timer when first targeting, not every frame
          if (p.autoAttackTimer <= 0) {
              p.autoAttackTimer = AUTO_ATTACK_DURATION;
          }

          // AI: LoL-style attack range check - use true 3D distance with height
          const effectiveAttackRange = ATTACK_RANGE;
          if (dist > effectiveAttackRange) {
              // AI: Move closer using LoL-style approach behavior
              const optimalDistance = effectiveAttackRange * 0.8; // Stay slightly within range

              // Avoid division by zero
              if (dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;

                // AI: Position drone to maintain optimal attack distance
                const targetX = targetedEnemy.x - nx * optimalDistance;
                const targetY = targetedEnemy.y - ny * optimalDistance;

                // Clamp to world boundaries if available
                const clampedX = Math.max(8, Math.min(targetX, game.WORLD_WIDTH - 8));
                const clampedY = Math.max(8, Math.min(targetY, game.WORLD_HEIGHT - 8));

                p.target = { x: clampedX, y: clampedY };
                
                // AI: Continuously follow target if it moves (LoL behavior)
                p.continuousMovement = true;
              } else {
                // fallback: move directly to enemy center
                p.target = { x: targetedEnemy.x, y: targetedEnemy.y };
              }
          } else {
              // AI: In range, stop moving and attack with LoL-style timing
              p.target = null;
              p.continuousMovement = false;
              
              // AI: Always face the target while attacking - direct facing for proper combat orientation
              const simpleDx = targetedEnemy.x - p.x;
              const simpleDy = targetedEnemy.y - p.y;
              const targetAngle = Math.atan2(simpleDy, simpleDx);
              p.angle = targetAngle; // Direct facing - no sprite adjustment needed
              
              p.fireCooldown -= dt;
              if (p.fireCooldown <= 0) {
                  // AI: Compute muzzle position using shared helper so spawn matches rendering
                  const muzzle = getMuzzlePosition(p);
                  // AI: Nudge the start position forward to ensure projectile spawns in front of the drone
                  const extraForward = 6; // pixels
                  const theta = p.angle + Math.PI / 2;
                  const startX = muzzle.x + Math.cos(theta) * extraForward;
                  const startY = muzzle.y + Math.sin(theta) * extraForward;
                  
                  // AI: Create projectile targeting the original enemy (damage system needs the real enemy object)
                  createProjectile(startX, startY, targetedEnemy);
                  playGunshotSound();
                  p.fireCooldown = FIRE_COOLDOWN; // Use shared constant for consistency
              }
          }
      }
  } else {
      // AI: LoL-style auto-attack system - continue attacking for duration even without explicit targeting
      if (p.autoAttackTimer > 0) {
          p.autoAttackTimer -= dt; // Count down timer
          
          // AI: Find nearest enemy within extended range for auto-attack acquisition
          const nearestEnemy = findNearestEnemy(p.x, p.y);
          if (nearestEnemy && !nearestEnemy.isDead && nearestEnemy.hp > 0) {
              // AI: Calculate distance with drone height considerations
              const dx = nearestEnemy.x - p.x;
              const dy = (nearestEnemy.y - nearestEnemy.size) - (p.y - DRONE_HEIGHT_OFFSET);
              const dist = Math.hypot(dx, dy);
              
              // AI: Auto-attack if enemy is within acquisition range (slightly larger than attack range)
              const acquisitionRange = ATTACK_RANGE * 1.2; // 20% larger acquisition range
              if (dist <= acquisitionRange) {
                  // AI: Auto-target the nearest enemy for continued combat
                  setTargetedEnemy(nearestEnemy);
              }
          }
      } else {
          // AI: Auto-attack timer expired, ensure it stays at 0
          p.autoAttackTimer = 0;
      }
  }

  // Update enemies and projectiles
  updateEnemies(dt);
  updateProjectiles(dt);
}

/**
 * AI: Draws a visual indicator at the target location when right-clicking to move
 */
function drawTargetMarker() {
  // AI: Show target marker based on actual player target, not stored marker position
  if (!game.player.target && !game.targetMarker) return;
  
  const { ctx } = game;
  const p = game.player;
  
  // AI: Use player's actual target if it exists, otherwise use stored marker
  let targetX, targetY, alpha;
  
  if (p.target) {
    // Player has an active target - show marker at target location
    targetX = p.target.x;
    targetY = p.target.y;
    alpha = 0.8; // Full visibility when actively moving
  } else if (game.targetMarker) {
    // No active target but marker is fading out
    targetX = game.targetMarker.x;
    targetY = game.targetMarker.y;
    alpha = Math.max(0, game.targetMarker.life / game.targetMarker.maxLife);
  } else {
    return;
  }
  
  ctx.save();
  
  // AI: Apply flattening transform to match drone's isometric perspective
  ctx.translate(targetX, targetY);
  ctx.transform(1, 0, 0, 0.7, 0, 0); // Same squash as drone (vertical flattening)
  
  // Draw tiny pulsing ellipse at target location (much smaller than before)
  const pulseSize = 3 + Math.sin(Date.now() * 0.01) * 0.5; // Smaller pulsing effect
  
  // Outer ring (tiny)
  ctx.beginPath();
  ctx.arc(0, 0, pulseSize + 1, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.6})`; // Cyan color matching drone
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Center dot (very small)
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(34, 211, 238, ${alpha * 0.8})`;
  ctx.fill();
  
  ctx.restore();
}

/**
 * Renders ground items as DOM elements for precise mouse detection and interaction. 
 * This function dynamically creates or updates HTML elements for each visible ground item, 
 * positioning them correctly on the screen and attaching necessary data attributes.
 * These DOM elements enable accurate mouse hover and click detection based on their visual bounds.
 */
function renderGroundItemsAsDOM() {
  const desktop = document.getElementById('desktop-screen');
  // AI: Ensure the desktop screen exists before attempting to render elements.
  if (!desktop) return;

  // AI: Create a set of unique keys for current ground items to efficiently track additions/removals.
  const existingItemsKeys = new Set(game.groundItems.map(item => `${item.x}_${item.y}_${item.type}`));

  // AI: Remove any existing DOM elements for ground items that are no longer present in the game state,
  // or those marked as 'pending' (e.g., in transition or about to be removed).
  const existingElements = desktop.querySelectorAll('.ground-item');
  existingElements.forEach(el => {
    const itemKey = `${el.dataset.x}_${el.dataset.y}_${el.dataset.type}`;
    if (!existingItemsKeys.has(itemKey) || el.classList.contains('pending')) {
      el.remove();
    }
  });

  // AI: Iterate through the game's current ground items to create or update their corresponding DOM elements.
  game.groundItems.forEach(item => {
    // AI: Skip items that have been marked as collected to prevent rendering them.
    if (item._collected) return; 

    // AI: Generate a unique key for the item to find existing DOM elements or create new ones.
    const itemKey = `${item.x}_${item.y}_${item.type}`;
    let element = desktop.querySelector(`[data-item-key="${itemKey}"]`);

    // AI: If no existing DOM element is found for this item, create a new one.
    if (!element) {
      element = document.createElement('div');
      element.className = 'ground-item'; // AI: Apply base styling class.
      element.dataset.itemKey = itemKey; // AI: Store a unique key for lookup.
      element.dataset.x = item.x; // AI: Store world X coordinate for bounds calculation.
      element.dataset.y = item.y; // AI: Store world Y coordinate for bounds calculation.
      element.dataset.type = item.type; // AI: Store item type for icon lookup and interaction logic.
      element.dataset.itemId = item.type; // AI: Also store as itemId for consistency.
      element.dataset.rightClickTarget = 'true'; // AI: Mark as right-click target for highlighting.
      element.style.position = 'absolute'; // AI: Enable precise positioning.
      // AI: 'pointerEvents: none' ensures mouse events pass through to the canvas below,
      // allowing the canvas's mouse handlers to function for movement and other interactions.
      element.style.pointerEvents = 'none'; 
      element.style.zIndex = '10'; // AI: Position the element above the canvas but below main UI.

      // AI: Create a container for the pixel icon within the ground item element.
      const iconEl = document.createElement('div');
      iconEl.style.width = '18px'; // AI: Set the visual size of the icon (1.5x scale).
      iconEl.style.height = '18px';
      iconEl.style.imageRendering = 'pixelated'; // AI: Maintain pixel art aesthetic.
      element.appendChild(iconEl);

      // AI: Add the newly created ground item element to the desktop screen.
      desktop.appendChild(element);
      console.log('InteractiveHighlight: Created ground item DOM element with data-right-click-target:', element.dataset.rightClickTarget);
    }

    // AI: Update the DOM element's position based on the item's world coordinates and the current camera view.
    // This ensures the DOM element moves with the camera, staying aligned with the canvas rendering.
    const screenCoords = worldToScreenCoords(item.x, item.y, camera);
    if (screenCoords) {
      // AI: Position the element centrally based on its 18x18 pixel size.
      element.style.left = `${screenCoords.x - 9}px`; 
      element.style.top = `${screenCoords.y - 9}px`;

      // AI: Update the visual icon of the DOM element. 
      // We clear backgroundImage here and rely on CSS to apply background-image from pixelIcons.js.
      const iconEl = element.firstChild;
      if (iconEl) {
        iconEl.style.backgroundImage = '';
        // AI: Note: The actual pixel icon rendering (using Canvas) is handled by drawGroundItems() (if still active),
        // or by CSS if the item has a sprite sheet / data URI. The data attributes are used by bounds detection.
      }
    } else {
      // AI: If the item is off-screen (screenCoords are null/undefined), hide its DOM element.
      element.style.left = '-9999px';
    }
  });
}

/**
 * Renders resource nodes as DOM elements for precise mouse detection and interaction.
 * This function dynamically creates or updates HTML elements for each visible resource node,
 * positioning them correctly on the screen and attaching necessary data attributes.
 * These DOM elements enable accurate mouse hover and click detection based on their visual bounds,
 * aligning with the precise interaction system.
 */
function renderResourceNodesAsDOM() {
  const desktop = document.getElementById('desktop-screen');
  // AI: Ensure the desktop screen exists before attempting to render elements.
  if (!desktop) return;

  // AI: Create a set of unique keys for current resource nodes to efficiently track additions/removals.
  const existingNodesKeys = new Set(game.resourceNodes.map(node => `${node.x}_${node.y}_${node.type}`));

  // AI: Remove any existing DOM elements for resource nodes that are no longer present in the game state.
  const existingElements = desktop.querySelectorAll('.resource-node');
  existingElements.forEach(el => {
    const nodeKey = `${el.dataset.x}_${el.dataset.y}_${el.dataset.type}`;
    if (!existingNodesKeys.has(nodeKey)) {
      el.remove();
    }
  });

  // AI: Iterate through the game's current resource nodes to create or update their corresponding DOM elements.
  game.resourceNodes.forEach(node => {
    // AI: Generate a unique key for the node to find existing DOM elements or create new ones.
    const nodeKey = `${node.x}_${node.y}_${node.type}`;
    let element = desktop.querySelector(`[data-node-key="${nodeKey}"]`);

    // AI: If no existing DOM element is found for this node, create a new one.
    if (!element) {
      element = document.createElement('div');
      element.className = 'resource-node'; // AI: Apply base styling class.
      element.dataset.nodeKey = nodeKey; // AI: Store a unique key for lookup.
      element.dataset.x = node.x; // AI: Store world X coordinate for bounds calculation.
      element.dataset.y = node.y; // AI: Store world Y coordinate for bounds calculation.
      element.dataset.type = node.type; // AI: Store node type for icon lookup and interaction logic.
      element.dataset.rightClickTarget = 'true'; // AI: Mark as right-click target for highlighting.
      element.style.position = 'absolute'; // AI: Enable precise positioning.
      // AI: 'pointerEvents: none' ensures mouse events pass through to the canvas below,
      // allowing the canvas's mouse handlers to function for movement and other interactions.
      element.style.pointerEvents = 'none';
      element.style.zIndex = '10'; // AI: Position the element above the canvas but below main UI.

      // AI: Create a container for the pixel icon within the resource node element.
      const iconEl = document.createElement('div');
      iconEl.style.width = '18px'; // AI: Set the visual size of the icon (1.5x scale).
      iconEl.style.height = '18px';
      iconEl.style.imageRendering = 'pixelated'; // AI: Maintain pixel art aesthetic.
      element.appendChild(iconEl);

      // AI: Add the newly created resource node element to the desktop screen.
      desktop.appendChild(element);
      console.log('InteractiveHighlight: Created resource node DOM element with data-right-click-target:', element.dataset.rightClickTarget);
    }

    // AI: Update the DOM element's position based on the node's world coordinates and the current camera view.
    // This ensures the DOM element moves with the camera, staying aligned with the canvas rendering.
    const screenCoords = worldToScreenCoords(node.x, node.y, camera);
    if (screenCoords) {
      // AI: Position the element centrally based on its 18x18 pixel size.
      element.style.left = `${screenCoords.x - 9}px`;
      element.style.top = `${screenCoords.y - 9}px`;

      // AI: Update the visual icon of the DOM element.
      // We clear backgroundImage here and rely on CSS to apply background-image from pixelIcons.js.
      const iconEl = element.firstChild;
      if (iconEl) {
        iconEl.style.backgroundImage = '';
        // AI: Note: The actual pixel icon rendering (using Canvas) is handled by drawResourceNodes() (if still active),
        // or by CSS if the node has a sprite sheet / data URI. The data attributes are used by bounds detection.
      }
    } else {
      // AI: If the node is off-screen (screenCoords are null/undefined), hide its DOM element.
      element.style.left = '-9999px';
    }
  });
}

/**
 * Renders enemies as DOM elements for precise mouse detection and interaction.
 * This function dynamically creates or updates HTML elements for each visible enemy,
 * positioning them correctly on the screen and attaching necessary data attributes.
 * These DOM elements enable accurate mouse hover and click detection based on their visual bounds.
 */
function renderEnemiesAsDOM() {
  const desktop = document.getElementById('desktop-screen');
  // AI: Ensure the desktop screen exists before attempting to render elements.
  if (!desktop) return;

  // AI: Create a set of unique keys for current enemies to efficiently track additions/removals.
  const existingEnemiesKeys = new Set(game.enemies.map(enemy => `${enemy.x}_${enemy.y}_${enemy.id}`));

  // AI: Remove any existing DOM elements for enemies that are no longer present in the game state,
  // or those marked as 'pending' (e.g., in transition or about to be removed).
  const existingElements = desktop.querySelectorAll('.enemy-sprite');
  existingElements.forEach(el => {
    const enemyKey = `${el.dataset.x}_${el.dataset.y}_${el.dataset.enemyId}`;
    if (!existingEnemiesKeys.has(enemyKey) || el.classList.contains('pending')) {
      el.remove();
    }
  });

  // AI: Iterate through the game's current enemies to create or update their corresponding DOM elements.
  game.enemies.forEach(enemy => {
    // AI: Skip enemies that have been marked as dead to prevent rendering them.
    if (enemy.isDead || enemy.hp <= 0) return;

    // AI: Generate a unique key for the enemy to find existing DOM elements or create new ones.
    const enemyKey = `${enemy.x}_${enemy.y}_${enemy.id}`;
    let element = desktop.querySelector(`[data-enemy-key="${enemyKey}"]`);

    // AI: If no existing DOM element is found for this enemy, create a new one.
    if (!element) {
      element = document.createElement('div');
      element.className = 'enemy-sprite'; // AI: Apply base styling class.
      element.dataset.enemyKey = enemyKey; // AI: Store a unique key for lookup.
      element.dataset.x = enemy.x; // AI: Store world X coordinate for bounds calculation.
      element.dataset.y = enemy.y; // AI: Store world Y coordinate for bounds calculation.
      element.dataset.enemyId = enemy.id; // AI: Store enemy ID for interaction logic.
      element.dataset.rightClickTarget = 'true'; // AI: Mark as right-click target for highlighting.
      element.style.position = 'absolute'; // AI: Enable precise positioning.
      // AI: 'pointerEvents: none' ensures mouse events pass through to the canvas below,
      // allowing the canvas's mouse handlers to function for movement and other interactions.
      element.style.pointerEvents = 'none';
      element.style.zIndex = '10'; // AI: Position the element above the canvas but below main UI.

      // AI: Create a container for the enemy sprite within the enemy element.
      const spriteEl = document.createElement('div');
      spriteEl.style.width = '32px'; // AI: Set the visual size of the enemy sprite.
      spriteEl.style.height = '32px';
      spriteEl.style.imageRendering = 'pixelated'; // AI: Maintain pixel art aesthetic.
      element.appendChild(spriteEl);

      // AI: Add the newly created enemy element to the desktop screen.
      desktop.appendChild(element);
      console.log('InteractiveHighlight: Created enemy DOM element with data-right-click-target:', element.dataset.rightClickTarget);
    }

    // AI: Update the DOM element's position based on the enemy's world coordinates and the current camera view.
    // This ensures the DOM element moves with the camera, staying aligned with the canvas rendering.
    const screenCoords = worldToScreenCoords(enemy.x, enemy.y, camera);
    if (screenCoords) {
      // AI: Position the element centrally based on its 32x32 pixel size.
      element.style.left = `${screenCoords.x - 16}px`;
      element.style.top = `${screenCoords.y - 16}px`;

      // AI: Update the visual sprite of the DOM element.
      // We clear backgroundImage here and rely on CSS to apply background-image from pixelIcons.js.
      const spriteEl = element.firstChild;
      if (spriteEl) {
        spriteEl.style.backgroundImage = '';
        // AI: Note: The actual enemy sprite rendering (using Canvas) is handled by drawEnemies() (if still active),
        // or by CSS if the enemy has a sprite sheet / data URI. The data attributes are used by bounds detection.
      }
    } else {
      // AI: If the enemy is off-screen (screenCoords are null/undefined), hide its DOM element.
      element.style.left = '-9999px';
    }
  });
}

/**
 * Renders world objects as DOM elements for precise mouse detection and interaction.
 * This function dynamically creates or updates HTML elements for each visible world object,
 * positioning them correctly on the screen and attaching necessary data attributes.
 * These DOM elements enable accurate mouse hover and click detection based on their visual bounds.
 */
function renderWorldObjectsAsDOM() {
  const desktop = document.getElementById('desktop-screen');
  // AI: Ensure the desktop screen exists before attempting to render elements.
  if (!desktop) return;

  // AI: Create a set of unique keys for current world objects to efficiently track additions/removals.
  const existingWorldObjectsKeys = new Set(game.worldObjects.map(obj => `${obj.x}_${obj.y}_${obj.id}`));

  // AI: Remove any existing DOM elements for world objects that are no longer present in the game state.
  const existingElements = desktop.querySelectorAll('.world-object-icon');
  existingElements.forEach(el => {
    const objectKey = `${el.dataset.x}_${el.dataset.y}_${el.dataset.objectId}`;
    if (!existingWorldObjectsKeys.has(objectKey)) {
      el.remove();
    }
  });

  // AI: Iterate through the game's current world objects to create or update their corresponding DOM elements.
  game.worldObjects.forEach(obj => {
    // AI: Generate a unique key for the world object to find existing DOM elements or create new ones.
    const objectKey = `${obj.x}_${obj.y}_${obj.id}`;
    let element = desktop.querySelector(`[data-object-key="${objectKey}"]`);

    // AI: If no existing DOM element is found for this world object, create a new one.
    if (!element) {
      element = document.createElement('div');
      element.className = 'world-object-icon'; // AI: Apply base styling class.
      element.dataset.objectKey = objectKey; // AI: Store a unique key for lookup.
      element.dataset.x = obj.x; // AI: Store world X coordinate for bounds calculation.
      element.dataset.y = obj.y; // AI: Store world Y coordinate for bounds calculation.
      element.dataset.objectId = obj.id; // AI: Store object ID for interaction logic.
      element.dataset.rightClickTarget = 'true'; // AI: Mark as right-click target for highlighting.
      element.style.position = 'absolute'; // AI: Enable precise positioning.
      // AI: 'pointerEvents: none' ensures mouse events pass through to the canvas below,
      // allowing the canvas's mouse handlers to function for movement and other interactions.
      element.style.pointerEvents = 'none';
      element.style.zIndex = '10'; // AI: Position the element above the canvas but below main UI.

      // AI: Create a container for the world object icon within the world object element.
      const iconEl = document.createElement('div');
      iconEl.style.width = '48px'; // AI: Set the visual size of the world object icon.
      iconEl.style.height = '48px';
      iconEl.style.imageRendering = 'pixelated'; // AI: Maintain pixel art aesthetic.
      element.appendChild(iconEl);

      // AI: Add the newly created world object element to the desktop screen.
      desktop.appendChild(element);
      console.log('InteractiveHighlight: Created world object DOM element with data-right-click-target:', element.dataset.rightClickTarget);
    }

    // AI: Update the DOM element's position based on the world object's world coordinates and the current camera view.
    // This ensures the DOM element moves with the camera, staying aligned with the canvas rendering.
    const screenCoords = worldToScreenCoords(obj.x, obj.y, camera);
    if (screenCoords) {
      // AI: Position the element centrally based on its 48x48 pixel size.
      element.style.left = `${screenCoords.x - 24}px`;
      element.style.top = `${screenCoords.y - 24}px`;

      // AI: Update the visual icon of the DOM element.
      // We clear backgroundImage here and rely on CSS to apply background-image from pixelIcons.js.
      const iconEl = element.firstChild;
      if (iconEl) {
        iconEl.style.backgroundImage = '';
        // AI: Note: The actual world object icon rendering (using Canvas) is handled by drawWorldObjects() (if still active),
        // or by CSS if the object has a sprite sheet / data URI. The data attributes are used by bounds detection.
      }
    } else {
      // AI: If the world object is off-screen (screenCoords are null/undefined), hide its DOM element.
      element.style.left = '-9999px';
    }
  });
}

// Main game loop
function loop(ts) {
  // AI: Enhanced alt-tab protection with page visibility state
  if (document.hidden || document.visibilityState === 'hidden') {
    // AI: Page is hidden, skip frame and reset timing to prevent lag accumulation
    game.lastTs = ts || performance.now();
    game.timeAccumulator = 0; // Reset accumulator to prevent catch-up lag
    requestAnimationFrame(loop);
    return;
  }

  // AI: Use the safe getTime function to avoid performance.now() issues
  const getTime = () => (typeof window !== 'undefined' && window.performance && window.performance.now) ? window.performance.now() : Date.now();
  const now = ts || getTime();

  // AI: Handle first frame or invalid timestamp
  if (!game.lastTs || game.lastTs <= 0) {
    game.lastTs = now;
    requestAnimationFrame(loop);
    return;
  }

  // AI: Calculate delta time since the last frame.
  let dt = (now - game.lastTs) / 1000;
  game.lastTs = now;

  // AI: Enhanced protection against tab focus lag spikes
  // Much more aggressive capping to prevent lag on return from alt-tab
  const MAX_FRAME_TIME = 0.016; // Cap at 16ms (60 FPS) to prevent catch-up lag
  if (dt > MAX_FRAME_TIME) {
    dt = MAX_FRAME_TIME;
    // AI: Reset accumulator on large time gaps to prevent lag spiral
    game.timeAccumulator = 0;
  }

  // AI: If delta time is invalid, use standard frame time
  if (dt <= 0 || !isFinite(dt)) {
    dt = 1 / 60;
  }

  // AI: Use a fixed time step for the physics and game logic updates.
  // This ensures a stable and consistent simulation, regardless of the frame rate.
  const FIXED_DT = 1 / 60; // Run simulation at a fixed 60 updates per second.

  // Add the elapsed time to an accumulator.
  game.timeAccumulator += dt;

  // AI: Limit accumulator to prevent excessive catch-up after alt-tab
  const MAX_ACCUMULATOR = FIXED_DT * 3; // Max 3 frames of catch-up
  if (game.timeAccumulator > MAX_ACCUMULATOR) {
    game.timeAccumulator = MAX_ACCUMULATOR;
  }

  // While there's enough accumulated time for one or more fixed steps, update the game logic.
  while (game.timeAccumulator >= FIXED_DT) {
    update(FIXED_DT); // Update game state
    game.timeAccumulator -= FIXED_DT;
  }

  // AI: Update the camera once per frame, after all physics updates are complete.
  // This prevents the camera from moving too quickly when the game catches up on missed time.
  camera.update();
  
  const { ctx } = game;
  
  // AI: Guard against null context in main loop
  if (!ctx) {
    console.warn('Canvas context not ready, skipping frame');
    requestAnimationFrame(loop);
    return;
  }
  
  // AI: The drawTerrain function now handles clearing the canvas.
  
  // Draw game world elements
  drawTerrain();

  // AI: Apply camera zoom and translation for all world objects.
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawGroundItems();
  drawResourceNodes();
  drawWorldObjects();
  drawEnemies();
  drawProjectiles();
  drawRemotePlayers();
  drawPlayer(game.player);
  drawMiningLaser(ctx, game.player, game.player.activeMiningNode);
  drawSelfMarker(game.player, multiplayerManager.localPlayer.color);
  drawTargetMarker();

  // AI: Restore the context to draw UI elements at fixed screen positions.
  ctx.restore();
  // renderInteractionPromptDOM(); // Removed per user request to disable 'E' key interactions.
  
  // Draw UI elements (keep these for now as they are UI related)
  // drawConnectionStatus(); // Removed as per edit hint

  // AI: Render ground items as DOM elements for precise mouse detection
  renderGroundItemsAsDOM();

  // AI: Render resource nodes as DOM elements for precise mouse detection
  renderResourceNodesAsDOM();

  // AI: Render enemies as DOM elements for precise mouse detection and highlighting
  // TODO: Consider canvas-based highlighting for better performance with many enemies
  // Current DOM approach works but may have performance implications with 20+ enemies
  renderEnemiesAsDOM();

  // AI: Render world objects as DOM elements for precise mouse detection and highlighting
  renderWorldObjectsAsDOM();

  // AI: Render ground item highlights when hovering
  renderDomGroundItemHint();

  // AI: Removed complex chat bubble updates - using multiplayerManager

  requestAnimationFrame(loop);
}

/**
 * Initializes the main game area, setting up the canvas, event listeners, and starting the game loop.
 * This function is called once when the game area is loaded.
 * @param {{x: number, y: number} | null} initialPosition - The player's starting position.
 */
export async function initAreaGame(initialPosition) {
  try {
    const canvas = await waitForCanvas();
    game.canvas = canvas;
    game.ctx = canvas.getContext('2d');
    game.ctx.imageSmoothingEnabled = false;
  
    // AI: Dynamically set the world and canvas size to match the actual rendered size of the element.
    // This is the definitive solution to ensure the game world perfectly fills the screen,
    // removing any black bars, seams, or boundary issues by creating a 1:1 pixel mapping.
    const rect = canvas.getBoundingClientRect();
    game.WORLD_WIDTH = rect.width;
    game.WORLD_HEIGHT = rect.height;
    game.width = rect.width;
    game.height = rect.height;
    canvas.width = game.width;
    canvas.height = game.height;

    // AI: Load resource nodes from areaData.js for the current area
    const currentArea = 'beach'; // AI: Hardcoded for now, can be dynamic later
    if (areaData[currentArea] && areaData[currentArea].resourceNodes) {
      game.resourceNodes = areaData[currentArea].resourceNodes;
    }
    subscribeResourceNodes(currentArea);

    // AI: Set the player's starting position. If a valid saved position is provided, use it.
    // Otherwise, default to the center of the world. This ensures saved positions are respected.
    if (initialPosition && typeof initialPosition.x === 'number' && typeof initialPosition.y === 'number') {
      // AI: Ensure the loaded position is within world bounds to prevent off-screen spawning
      const clampedX = Math.max(8, Math.min(initialPosition.x, game.WORLD_WIDTH - 8));
      const clampedY = Math.max(8, Math.min(initialPosition.y, game.WORLD_HEIGHT - 8));
      game.player.x = clampedX;
      game.player.y = clampedY;
    } else {
      game.player.x = game.WORLD_WIDTH / 2;
      game.player.y = game.WORLD_HEIGHT / 2;
    }

    // AI: The player's state is already updated by playerService. No need to force a save here.

    // AI: Initialize world objects (market, etc.)
    initWorldObjects();
    game.areaData = areaData.beach;
    initEnemies();

    // AI: Initialize all multiplayer and combat systems in correct order
    initMultiplayerSystem();
    initNetwork();
    initProjectiles(); // Initialize projectile system for proper server sync


    // AI: Initialize ping display
    pingDisplay.init();
    
    // AI: Initialize experience system
    experienceBar.init();

    // AI: Initialize interactive highlighting system
    const desktop = document.getElementById('desktop-screen');
    if (desktop) {
      initializeInteractiveHighlight(desktop);
      console.log('InteractiveHighlight: Initialized successfully');

      // AI: Debug - Check if any highlightable elements exist
      setTimeout(() => {
        const highlightableElements = desktop.querySelectorAll('[data-right-click-target="true"]');
        console.log('InteractiveHighlight: Found', highlightableElements.length, 'highlightable elements:');
        highlightableElements.forEach((el, index) => {
          console.log(`  ${index + 1}. ${el.className} at (${el.style.left}, ${el.style.top})`);
        });
      }, 1000); // Wait 1 second for DOM elements to be created
    } else {
      console.error('InteractiveHighlight: Could not find desktop-screen element');
    }

    // AI: Expose the game instance globally for desktop.js to access.
    window.gameInstance = game;
    
    // AI: Add mouse wheel listener for zooming with more restrictive limits.
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // AI: Adjust target zoom level for smooth interpolation
        const zoomDelta = e.deltaY > 0 ? -0.15 : 0.15;
        const MIN_ZOOM = 1.5;
        const MAX_ZOOM = 2.5;
        camera.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.targetZoom + zoomDelta));
      },
      { passive: false },
    );


    // AI: Hybrid movement system - track mouse state
    let isRightMouseHeld = false;
    let rightClickStartTime = 0;
    let rightClickStartPos = null;
    const HOLD_THRESHOLD = 200; // milliseconds to distinguish click from hold

    // AI: Add mousedown and mouseup listeners for hybrid click-to-move/hold-to-move.
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { // Right mouse button
        e.preventDefault();
        isRightMouseHeld = true;
        rightClickStartTime = Date.now();
        
        // AI: Manually update mouse coords on mousedown to ensure the drone moves
        // toward the correct location even if the mouse doesn't move.
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;
        const worldCoords = screenToWorldCoords(screenX, screenY, camera);
        
        rightClickStartPos = { x: screenX, y: screenY };
        game.mouse.x = worldCoords.x;
        game.mouse.y = worldCoords.y;
        
        // AI: League of Legends-style enemy targeting with improved click detection
        const clickedEnemy = findNearestEnemy(worldCoords.x, worldCoords.y);
        const enemyClickRadius = clickedEnemy ? Math.max(clickedEnemy.size * 2.5, 15) : 0; // Larger click area
        
        if (clickedEnemy && Math.hypot(clickedEnemy.x - worldCoords.x, clickedEnemy.y - worldCoords.y) < enemyClickRadius) {
            // AI: Target enemy with LoL-style auto-attack behavior
            setTargetedEnemy(clickedEnemy);
            game.player.target = null; // Clear movement target - combat system will handle positioning
            game.targetMarker = null; // Clear visual marker
            game.player.autoAttackTimer = AUTO_ATTACK_DURATION; // Initialize auto-attack timer
            // AI: Removed fireCooldown reset - respect attack timing
            game.player.continuousMovement = false; // Start with precise positioning
        } else {
            // AI: Clear enemy targeting and move to location (LoL move command)
            setTargetedEnemy(null);
            game.player.autoAttackTimer = 0; // Clear auto-attack when moving
            // Set initial target for immediate response
            game.player.target = worldCoords;
            game.player.continuousMovement = false; // Start as point-to-point
            game.player.action = null; // Clear any active player action
            
            // AI: Create visual target marker - use original world coords since marker applies its own transform
            game.targetMarker = {
              x: worldCoords.x,
              y: worldCoords.y,
              life: 2.0, // 2 seconds
              maxLife: 2.0
            };
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 2) { // Right mouse button
        e.preventDefault();
        isRightMouseHeld = false;
        
        const holdDuration = Date.now() - rightClickStartTime;
        
        if (holdDuration < HOLD_THRESHOLD) {
          // Short click = move to point (already set in mousedown)
          game.player.continuousMovement = false;
        } else {
          // Was holding = stop continuous movement
          game.player.continuousMovement = false;
        }
      }
    });

    // AI: Prevent the context menu from appearing on right-click.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // AI: Enhanced mousemove handler for both cursor tracking and continuous movement
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      const worldCoords = screenToWorldCoords(mouseX, mouseY, camera);
      
      // Always update mouse position for drone rotation
      game.mouse.x = worldCoords.x;
      game.mouse.y = worldCoords.y;

      // Handle continuous movement while holding right mouse
      if (isRightMouseHeld) {
        const holdDuration = Date.now() - rightClickStartTime;
        
        if (holdDuration > HOLD_THRESHOLD) {
          // Switch to continuous movement mode after hold threshold
          game.player.target = worldCoords;
          game.player.continuousMovement = true; // Enable continuous movement
        }
      }
    });
  
    // AI: Right-click interaction system (replaces 'E' key)
    // This allows manual interaction with resource nodes, ground items, and world objects.
    canvas.addEventListener('contextmenu', (e) => {
      // AI: Prevent the default browser context menu from appearing.
      e.preventDefault();

      // AI: If the player is currently targeting an enemy, prioritize combat.
      // The existing targeting system will handle movement and attacks, so interaction clicks are ignored.
      if (game.player.target) {
        return; 
      }

      // AI: Get precise mouse coordinates relative to the canvas, accounting for canvas scaling.
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // AI: Check for interaction with world objects (e.g., market stalls, special NPCs).
      // If an interaction occurs, it takes precedence and no further checks are needed.
      const worldObjectInteracted = checkWorldObjectInteraction();
      if (worldObjectInteracted) {
        return; 
      }

      // AI: Initialize variables to track the nearest interactable object.
      // 'maxInteractionRadius' defines the maximum distance from the player where an interaction is possible.
      const maxInteractionRadius = INTERACTION_RADIUS; 
      let nearestInteractable = null;
      let nearestDist = Infinity;
      let interactionType = null;

      // AI: Iterate through all available resource nodes to find if the mouse is over one.
      // Resources are prioritized over ground items for interaction.
      for (const node of game.resourceNodes) {
        // AI: Skip nodes that are currently on cooldown, as they cannot be harvested.
        const isOnCooldown = node.cooldownUntil && Date.now() < node.cooldownUntil;
        if (isOnCooldown) continue;

        // AI: Use the precise 'isMouseOverItem' function to check if the mouse pointer is visually over the node's icon.
        // The scale of 1.5 is used to match the rendered size of the resource node icons.
        if (isMouseOverItem(mouseX, mouseY, node, camera, 1.5)) {
          // AI: Calculate the distance from the player's current position to the center of the resource node.
          const dist = Math.hypot(game.player.x - node.x, game.player.y - node.y);

          // AI: If the node is within the player's interaction radius AND it's closer than any previously found interactable,
          // mark it as the current nearest interactable. This ensures the player interacts with the closest valid object.
          if (dist < maxInteractionRadius && dist < nearestDist) {
            nearestDist = dist;
            nearestInteractable = node;
            interactionType = 'resourceNode';
          }
        }
      }

      // AI: If no resource node was found under the mouse, check for ground items.
      if (!nearestInteractable) {
        for (const item of game.groundItems) {
          // AI: Use 'isMouseOverItem' to check if the mouse pointer is visually over the ground item's icon.
          // The scale of 1.5 is consistent with how ground items are rendered.
          if (isMouseOverItem(mouseX, mouseY, item, camera, 1.5)) {
            // AI: Calculate the distance from the player's current position to the center of the ground item.
            const dist = Math.hypot(game.player.x - item.x, game.player.y - item.y);

            // AI: If the item is within the player's interaction radius AND it's closer than any previously found interactable,
            // mark it as the current nearest interactable.
            if (dist < maxInteractionRadius && dist < nearestDist) {
              nearestDist = dist;
              nearestInteractable = item;
              interactionType = 'groundItem';
            }
          }
        }
      }

      // AI: If a valid interactable object was found, perform the corresponding action.
      if (nearestInteractable) {
        if (interactionType === 'resourceNode') {
          // AI: Toggle the active state of the resource node. If activated, start mining laser sound; if deactivated, stop it.
          nearestInteractable.active = !nearestInteractable.active;
          if (nearestInteractable.active) {
            game.player.activeMiningNode = nearestInteractable;
            startLaserSound();
          } else {
            game.player.activeMiningNode = null;
            stopLaserSound();
          }
        } else if (interactionType === 'groundItem') {
          // AI: Process the collection of a ground item.
          // Mark the item as collected (to be removed from the game's groundItems array).
          nearestInteractable._collected = true;
          const amt = nearestInteractable.count || 1;

          // AI: Attempt to add the item to the player's inventory.
          // Play a pickup sound only if the item was successfully added (e.g., inventory not full).
          const addedToInv = addItemToInventory(nearestInteractable.type, amt);
          if (addedToInv) playPickupSound();

          // AI: Grant experience to the player for collecting the resource.
          experienceManager.addResourceExp(nearestInteractable.type);
        }
      }
    });
  
    // AI: Enhanced tab visibility handler with resolution fix
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // AI: Tab became hidden - pause game timing
        // Debug: console.log('Tab hidden, pausing game timing');
        game.timeAccumulator = 0;
      } else {
        // AI: Tab became visible - reset timing and fix resolution
        // Debug: console.log('Tab visible, resetting timing and checking resolution');

        // AI: Reset game timing to prevent lag spike
        game.lastTs = performance.now();
        game.timeAccumulator = 0;

        // AI: Snap enemy angles to target angles to prevent rotation glitches after tab focus
        const enemies = getEnemies();
        if (enemies && enemies.length > 0) {
          enemies.forEach(enemy => {
            if (enemy.hasValidTarget && enemy.targetAngle !== undefined) {
              // Snap to target angle to prevent rotation animation after tab focus
              enemy.angle = enemy.targetAngle;
            }
          });
        }

        // AI: Fix resolution issues after alt-tab
        setTimeout(() => {
          const canvas = game.canvas;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const newWidth = rect.width;
            const newHeight = rect.height;
            
            // AI: Only resize if dimensions actually changed
            if (Math.abs(canvas.width - newWidth) > 1 || Math.abs(canvas.height - newHeight) > 1) {
              console.log('Fixing resolution after alt-tab:', {old: {w: canvas.width, h: canvas.height}, new: {w: newWidth, h: newHeight}});
              canvas.width = newWidth;
              canvas.height = newHeight;
              game.width = newWidth;
              game.height = newHeight;
              game.WORLD_WIDTH = newWidth;
              game.WORLD_HEIGHT = newHeight;
              
              // AI: Reset canvas context state
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.imageSmoothingEnabled = false;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
              }
            }
          }
        }, 100); // Small delay to let browser settle
        
        // AI: Reset remote player interpolations
        if (multiplayerManager.isConnected()) {
          for (const player of multiplayerManager.getRemotePlayers()) {
            if (player.targetX !== undefined && player.targetY !== undefined) {
              // AI: Snap to target position immediately
              player.x = player.targetX;
              player.y = player.targetY;
              delete player.targetX;
              delete player.targetY;
              delete player.interpStartTime;
              delete player.interpStartX;
              delete player.interpStartY;
            }
          }
        }
        
        // AI: Reset enemy interpolations
        for (const enemy of getEnemies()) {
          if (enemy.targetX !== undefined && enemy.targetY !== undefined) {
            // AI: Snap to target position immediately
            enemy.x = enemy.targetX;
            enemy.y = enemy.targetY;
            delete enemy.targetX;
            delete enemy.targetY;
            delete enemy.interpStartTime;
            delete enemy.interpStartX;
            delete enemy.interpStartY;
          }
        }
      }
    });

    // AI: Add window focus/blur handlers for additional protection
    window.addEventListener('blur', () => {
      // Debug: console.log('Window blur - resetting game timing');
      game.timeAccumulator = 0;
    });

    window.addEventListener('focus', () => {
      // Debug: console.log('Window focus - resetting game timing');
      game.lastTs = performance.now();
      game.timeAccumulator = 0;

      // AI: Snap enemy angles to target angles to prevent rotation glitches after tab focus
      const enemies = getEnemies();
      if (enemies && enemies.length > 0) {
        enemies.forEach(enemy => {
          if (enemy.hasValidTarget && enemy.targetAngle !== undefined) {
            // Snap to target angle to prevent rotation animation after tab focus
            enemy.angle = enemy.targetAngle;
          }
        });
      }
    });
    
    // AI: Add resize handler to fix resolution issues
    window.addEventListener('resize', () => {
      setTimeout(() => {
        const canvas = game.canvas;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
          game.width = rect.width;
          game.height = rect.height;
          game.WORLD_WIDTH = rect.width;
          game.WORLD_HEIGHT = rect.height;
          
          // AI: Reset canvas context state
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
          }
        }
      }, 100);
    });

    // AI: Use getTime function for initial loop start
    const getTime = () => (typeof window !== 'undefined' && window.performance && window.performance.now) ? window.performance.now() : Date.now();

    // Listen for explicit snap requests from UI (loading screen) when tab focus/visibility changes.
    // Ensures transient state (angles, interpolations) is aligned before the loading overlay hides.
    document.addEventListener('game:request-snap', () => {
      try {
        // Snap remote players to their last targets to prevent rubber-banding on resume
        if (multiplayerManager && multiplayerManager.getRemotePlayers) {
          for (const player of multiplayerManager.getRemotePlayers()) {
            if (player.targetX !== undefined && player.targetY !== undefined) {
              player.x = player.targetX;
              player.y = player.targetY;
              delete player.targetX; delete player.targetY; delete player.interpStartTime; delete player.interpStartX; delete player.interpStartY;
            }
          }
        }

        // Snap enemies to server-provided positions/angles
        for (const enemy of getEnemies()) {
          if (enemy.targetX !== undefined && enemy.targetY !== undefined) {
            enemy.x = enemy.targetX;
            enemy.y = enemy.targetY;
            delete enemy.targetX; delete enemy.targetY; delete enemy.interpStartTime; delete enemy.interpStartX; delete enemy.interpStartY;
          }
          if (enemy.hasValidTarget && enemy.targetAngle !== undefined) {
            enemy.angle = enemy.targetAngle;
          }
        }
      } catch (e) {
        console.warn('game:request-snap handler failed', e);
      }
    });

    loop(getTime());
  } catch (error) {
    console.error('Failed to initialize area game:', error);
    // Fallback: try to continue with basic initialization
    const fallbackCanvas = document.getElementById('area-canvas');
    if (fallbackCanvas) {
      game.canvas = fallbackCanvas;
      game.ctx = fallbackCanvas.getContext('2d');
      fallbackCanvas.width = game.WORLD_WIDTH;
      fallbackCanvas.height = game.WORLD_HEIGHT;
      const getTime = () => (typeof window !== 'undefined' && window.performance && window.performance.now) ? window.performance.now() : Date.now();
      loop(getTime());
    }
  }
}

/**
 * AI: Initialize the simple multiplayer system
 */
function initMultiplayerSystem() {
  const user = auth.currentUser;
  if (!user) {
    console.warn('No authenticated user for multiplayer system');
    return;
  }

  // AI: Initialize simple multiplayer manager
  const username = gameState.username || user.displayName || 'Anonymous';
  multiplayerManager.initialize(user.uid, username);
  multiplayerManager.joinArea('beach');
  
  // AI: Setup cleanup on page unload/logout
  window.addEventListener('beforeunload', async () => {
    multiplayerManager.disconnect();
    cleanupEnemies(); // AI: Clean up enemy subscriptions

    // AI: Clean up interactive highlighting system
    const desktop = document.getElementById('desktop-screen');
    if (desktop) {
      cleanupInteractiveHighlight(desktop);
    }

    // AI: Save experience data before page unload
    try {
      await experienceManager.saveNow(user.uid);
    } catch (error) {
      console.error('Failed to save experience on page unload:', error);
    }
  });
  
  // AI: Setup cleanup on auth state change (logout)
  auth.onAuthStateChanged((currentUser) => {
    if (!currentUser) {
      // User logged out, clean up multiplayer and save experience
      multiplayerManager.disconnect();
      cleanupEnemies(); // AI: Clean up enemy subscriptions
      
      // AI: Try to save experience before cleanup (use stored uid if available)
      if (user && user.uid) {
        experienceManager.saveNow(user.uid).catch((error) => {
          console.error('Failed to save experience on logout:', error);
        });
      }
    }
  });
}
