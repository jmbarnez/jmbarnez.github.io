// Main game loop (update/render orchestrator)
// AI: Updated imports to include the new camera and coordinate conversion functions.
import { isInWater, drawTerrain, camera, setTerrainSeed } from './world.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../utils/worldConstants.js';

import { playerService } from '../services/playerService.js';
import { drawGroundItems } from './items.js';
import { harvestNode, drawResourceNodes, subscribeResourceNodes } from './resources.js';
import { addItemToInventory } from '../ui/inventory.js';
import { playPickupSound } from '../utils/sfx.js';
import { pickupGroundItem } from '../services/groundItemService.js';
import { playMiningSound, startLaserSound, stopLaserSound, playCycleCompleteSound, playGunshotSound } from '../utils/sfx.js';
import { drawRemotePlayers, initNetwork } from './network.js';
import { multiplayerManager } from './multiplayerManager.js';
import { pingDisplay } from '../ui/pingDisplay.js';
import { experienceManager } from './experienceManager.js';
import { experienceBar } from '../ui/experienceBar.js';
import { drawPlayer, drawSelfMarker, drawMiningLaser, getMuzzlePosition } from './player.js';
import { worldToScreenCoords, screenToWorldCoords, calculateEntityDepth } from '../utils/math.js';
import { joinArea, subscribeAreaPlayers } from '../services/realtimePosition.js';
import { subscribeGroundItems } from '../services/groundItemService.js';
import { ACCELERATION, DECELERATION, GRAVITY, DAMPING_FACTOR, MAX_SPEED, DEAD_ZONE, DECEL_ZONE, ATTACK_RANGE, MUZZLE_OFFSET, DRONE_HEIGHT_OFFSET, FIRE_COOLDOWN, INTERACTION_RADIUS, AUTO_ATTACK_DURATION, DAMAGE_PER_HIT } from '../utils/constants.js';
import { isMouseOverItem, getItemBounds } from '../data/pixelIcons.js';
import { auth } from '../utils/firebaseClient.js';
import { gameState } from '../app/state.js';
import { areaData } from '../data/areaData.js';
import { initWorldObjects, drawWorldObjects, checkWorldObjectInteraction } from './worldObjects.js';
import { initEnemies, updateEnemies, drawEnemies, drawEnemySprite, findNearestEnemy, setTargetedEnemy, getTargetedEnemy, getEnemies, cleanupEnemies } from './enemies.js';
import { updateDrone, fireWeapon, updateBallisticProjectiles, initializeDronePhysics, PHYSICS_CONSTANTS } from './physics.js';
import loadingScreen from '../utils/loadingScreen.js';
import { createProjectile, updateProjectiles, drawProjectiles, initProjectiles } from './projectiles.js';
import { waitForCanvas } from '../utils/domUtils.js';
import { highlightManager } from './highlightManager.js';
import { initHighlightEventListeners } from './ui.js';
import { initGroundItemUI, cleanupGroundItemUI, updateFloatingMessages, drawGroundItemUI } from './groundItemUI.js';
// AI: Removed complex MP constants - using simple multiplayer manager

export const game = {
  canvas: null,
  ctx: null,
  // AI: Fixed world dimensions for deterministic terrain generation.
  // These are imported from world.js and provide consistent world size.
  WORLD_WIDTH,
  WORLD_HEIGHT,
  width: 0,
  height: 0,
  scale: 1, // Canvas scaling factor to fit screen
  // AI: Player's starting position is now set dynamically in the center of the world.
  player: { x: 0, y: 0, vx: 0, vy: 0, target: null, action: null, angle: 0, activeMiningNode: null, fireCooldown: 0, autoAttackTimer: 0, height: 20 },
  lastTs: 0,
  timeAccumulator: 0, // AI: Accumulator for fixed-step game loop to handle tab focus loss.
  groundItems: [], // {x,y,type,harvest:0-1} - individual pickup items
  resourceNodes: [], // Shared nodes from RTDB: {id,x,y,type,cooldownUntil,...}
  enemies: [], // Active enemies from enemies.js
  worldObjects: [], // Active world objects from worldObjects.js
  inventory: { seashell: 0, driftwood: 0, seaweed: 0 },
  // AI: Removed complex MP state - using multiplayerManager
  _lastDomHintEl: null,
  terrain: {}, // Initialize terrain object
  mouse: { x: 0, y: 0 }, // AI: Add mouse tracking for drone rotation
  isRightMouseDown: false, // AI: Track right mouse button state for hold-to-move
  targetMarker: null, // AI: Visual indicator for movement target
};

function update(dt) {
  const p = game.player;


  // AI: Ultra-Realistic Physics-Based Drone Movement
  // Replace simple acceleration with full rigid body physics

  // Convert mouse/keyboard input to physics input
  const input = {
    forward: false,
    backward: false,
    rotateLeft: false,
    rotateRight: false,
    strafeLeft: false,
    strafeRight: false,
    boost: false,
    fire: false
  };

  // Map keyboard input to physics input (simplified controls)
  // W for forward, A/D for sideways movement, mouse for yaw
  if (camera.keysPressed.w || camera.keysPressed.up) input.forward = true;
  if (camera.keysPressed.s || camera.keysPressed.down) input.backward = true;
  if (camera.keysPressed.a || camera.keysPressed.left) input.strafeLeft = true;
  if (camera.keysPressed.d || camera.keysPressed.right) input.strafeRight = true;
  if (camera.keysPressed.shift) input.boost = true;



  // Mouse-based instant turning (like FPS aiming)
  if (game.mouse && typeof game.mouse.x === 'number' && typeof game.mouse.y === 'number') {
    const dx = game.mouse.x - p.x;
    const dy = game.mouse.y - p.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 5) { // Avoid jitter when mouse is very close to player
      const targetAngle = Math.atan2(dy, dx);
      // Instantly set orientation to mouse direction (no physics rotation)
      if (p.physics) {
        p.physics.orientation = targetAngle;
        p.physics.angularVelocity = 0; // Stop any ongoing rotation
      }
      p.angle = targetAngle; // Also update the entity angle directly
    }
  }

  // Handle target-based movement (mouse clicks) as fallback
  if (p.target && p.continuousMovement && !input.forward) {
    // Convert target-based movement to physics input
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist > DEAD_ZONE) {
      input.forward = true;

      // Calculate desired rotation towards target
      const targetAngle = Math.atan2(dy, dx);
      const angleDiff = targetAngle - p.physics.orientation;

      // Normalize angle difference to [-π, π]
      const normalizedDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;

      if (Math.abs(normalizedDiff) > 0.1) {
        input.rotateLeft = normalizedDiff > 0;
        input.rotateRight = normalizedDiff < 0;
      }
    }
  }

  // Handle weapon firing
  if (p.fireCooldown <= 0) {
    input.fire = true;
    p.fireCooldown = FIRE_COOLDOWN;
  }

  // Update drone physics
  if (p.physics) {
    updateDrone(p, input, dt);
  } else {
    // Initialize physics if missing
    initializeDronePhysics(p);
  }

  // Handle pickup logic (keep existing auto-pickup system)
  if (p.target && !p.continuousMovement) {
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= DEAD_ZONE) {
      p.x = p.target.x;
      p.y = p.target.y;

      // Check if this was a ground item target and attempt pickup
      if (p.target.type === 'groundItem' && p.target.item) {
        const targetItem = p.target.item;
        console.log('[AUTO_PICKUP] Reached ground item, attempting pickup:', targetItem.type);

        const playerId = multiplayerManager.isConnected() && multiplayerManager.localPlayer
          ? multiplayerManager.localPlayer.uid
          : 'anonymous';

        pickupGroundItem(targetItem.id, playerId, p.x, p.y)
          .then(success => {
            if (success) {
              console.log('[AUTO_PICKUP] Successfully picked up ground item:', targetItem.type);
            } else {
              console.log('[AUTO_PICKUP] Failed to pick up ground item:', targetItem.type);
            }
          })
          .catch(error => {
            console.error('[AUTO_PICKUP] Error picking up ground item:', error);
          });
      }

      p.target = null;
    }
  }

  // Also check for auto-pickup during continuous movement when close enough
  if (p.continuousMovement && p.target && p.target.type === 'groundItem' && p.target.item) {
    const pickupRange = 32;
    const targetItem = p.target.item;
    const distanceToItem = Math.hypot(p.x - targetItem.x, p.y - targetItem.y);

    if (distanceToItem <= pickupRange) {
      console.log('[AUTO_PICKUP] Close enough during movement, attempting pickup:', targetItem.type);

      const playerId = multiplayerManager.isConnected() && multiplayerManager.localPlayer
        ? multiplayerManager.localPlayer.uid
        : 'anonymous';

      pickupGroundItem(targetItem.id, playerId, p.x, p.y)
        .then(success => {
          if (success) {
            console.log('[AUTO_PICKUP] Successfully picked up ground item during movement:', targetItem.type);
            // Stop movement after successful pickup
            p.target = null;
            p.continuousMovement = false;
          } else {
            console.log('[AUTO_PICKUP] Failed to pick up ground item during movement:', targetItem.type);
          }
        })
        .catch(error => {
          console.error('[AUTO_PICKUP] Error picking up ground item during movement:', error);
        });
    }
  }

  // Update fire cooldown
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);

  // 8. Continuously update player state for real-time saving.
  // This is now the primary way of saving position, replacing on-arrival saves.
  playerService.updateState({ x: p.x, y: p.y });

  // Remove any flagged ground items (picked up via E); no auto-harvest by proximity
  if (game.groundItems.some(n => n._collected)) {
    game.groundItems = game.groundItems.filter(n => !n._collected);
  }
  // Ground items are now spawned server-side only (from enemy deaths)
  // Removed client-side spawning to prevent desync issues

  // Shared resource nodes: idle harvesting like sand mounds
  for (const node of game.resourceNodes) {
    if (!node.active) continue;
    
    // Stop if player moved away (use same radius as interaction)
    const dx = node.x - p.x;
    const dy = node.y - p.y;
    const near = Math.hypot(dx, dy) <= INTERACTION_RADIUS;
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
  // Mouse-based instant turning handles rotation (no physics rotation needed)

  // AI: League of Legends-style Combat Logic with Auto-Attack System
  const targetedEnemy = getTargetedEnemy();
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

          // AI: Enhanced Auto-Pilot System - More Aggressive Enemy Following
          const effectiveAttackRange = ATTACK_RANGE;
          if (dist > effectiveAttackRange) {
              // AI: Move closer using enhanced auto-pilot behavior
              const optimalDistance = effectiveAttackRange * 0.7; // Stay well within range for better positioning

              // Avoid division by zero
              if (dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;

                // AI: Calculate target position for aggressive auto-pilot following
                const targetX = targetedEnemy.x - nx * optimalDistance;
                const targetY = targetedEnemy.y - ny * optimalDistance;

                // Clamp to world boundaries if available
                const clampedX = Math.max(8, Math.min(targetX, game.WORLD_WIDTH - 8));
                const clampedY = Math.max(8, Math.min(targetY, game.WORLD_HEIGHT - 8));

                p.target = { x: clampedX, y: clampedY };

                // AI: Enable aggressive auto-pilot following
                p.continuousMovement = true;
              } else {
                // fallback: move directly to enemy center
                p.target = { x: targetedEnemy.x, y: targetedEnemy.y };
              }
          } else {
              // AI: In range, stop moving and attack with LoL-style timing
              p.target = null;
              p.continuousMovement = false;
              
              // AI: While attacking we DO NOT force the drone to rotate to face the target.
              // Rotation remains controlled by mouse input so players can aim independently.
              
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

                  // AI: Sync projectile event to other players
                  if (multiplayerManager && multiplayerManager.queueProjectileEvent) {
                    multiplayerManager.queueProjectileEvent({
                      targetX: targetedEnemy.x,
                      targetY: targetedEnemy.y,
                      damage: DAMAGE_PER_HIT
                    });
                  }
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
              
              // AI: Enhanced auto-attack acquisition - more aggressive enemy following
              const acquisitionRange = ATTACK_RANGE * 1.5; // 50% larger acquisition range for better auto-pilot
              if (dist <= acquisitionRange) {
                  // AI: Auto-target the nearest enemy for continued combat
                  setTargetedEnemy(nearestEnemy);
                  // AI: Enable continuous movement for aggressive auto-pilot behavior
                  p.continuousMovement = true;
              }
          }
      } else {
          // AI: Auto-attack timer expired, ensure it stays at 0
          p.autoAttackTimer = 0;
      }
  }

  // Update enemies and projectiles
  updateEnemies(dt);
  // Update guaranteed-hit projectiles (visual + hit timing)
  updateProjectiles(dt);
  // Update ballistic projectiles with realistic physics
  updateBallisticProjectiles(dt);

  // Update ground item UI (floating messages)
  updateFloatingMessages(dt);
}

/**
 * AI: Draws a visual indicator at the target location for movement
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

  // Depth-sorted draw: collect drawable entities and sort by (y + height)
  const drawList = [];

  // Ground items
  for (const item of game.groundItems) drawList.push({ type: 'groundItem', y: item.y, fn: () => drawGroundItems() });
  // Resource nodes
  for (const node of game.resourceNodes) drawList.push({ type: 'resourceNode', y: node.y, fn: () => drawResourceNodes() });
  // World objects
  for (const obj of game.worldObjects) drawList.push({ type: 'worldObject', y: obj.y, fn: () => drawWorldObjects() });
  // Enemies (use game.enemies array)
  for (const e of game.enemies) drawList.push({ type: 'enemy', y: e.y + (e.height || 0), fn: () => drawEnemySprite(e) });
  // Projectiles
  for (const p of [] ) drawList.push({ type: 'projectile', y: p.y, fn: () => drawProjectiles() });

  // Sort by y (ascending) so objects further down draw later (on top)
  drawList.sort((a, b) => a.y - b.y);

  // Execute draw functions. Many entries may call batched drawers; to avoid
  // redundant draws we only call high-level draws once per frame below for
  // subsystems that already batch render.
  // Simpler approach: render batched subsystems first, then depth-sorted
  // per-entity sprites (enemies, player, remote players).
  drawGroundItems();
  drawResourceNodes();
  drawWorldObjects();
  drawProjectiles();

  // Draw enemies, remote players, and player with depth sorting
  // Combine enemies and remote players and player into a sortable list
  const dynamicEntities = [];
  for (const e of game.enemies) dynamicEntities.push({
    ent: e,
    depth: calculateEntityDepth(e.x, e.y, e.height),
    draw: () => {
      drawEnemySprite(e);
      // Also draw enemy UI (health bars, targeting indicators)
      const { ctx } = game;
      if (!ctx || e.isDead) return;

      // Draw health bar for damaged enemies
      if (e.hp < e.maxHp) {
        const barWidth = e.size * 2;
        const barHeight = 3;
        const barX = e.x - barWidth / 2;
        const barY = e.y - e.size * 2;

        // Health bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health bar
        ctx.fillStyle = 'red';
        const healthRatio = Math.max(0, e.hp / e.maxHp);
        ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
      }

      // Draw targeting circle for selected enemy
      if (game.targetedEnemy?.id === e.id) {
        ctx.save();
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  });
  for (const rp of multiplayerManager.getRemotePlayers()) dynamicEntities.push({
    ent: rp,
    depth: calculateEntityDepth(rp.x, rp.y, rp.height),
    draw: () => drawPlayer(rp)
  });
  dynamicEntities.push({
    ent: game.player,
    depth: calculateEntityDepth(game.player.x, game.player.y, game.player.height),
    draw: () => drawPlayer(game.player)
  });

  // Sort by depth (lower values = more in front)
  dynamicEntities.sort((a, b) => a.depth - b.depth);
  for (const d of dynamicEntities) d.draw();

  // Draw overlays related to player after main entities
  drawMiningLaser(ctx, game.player, game.player.activeMiningNode);
  drawSelfMarker(game.player, multiplayerManager.localPlayer.color);
  drawTargetMarker();

  // Draw ground item UI (tooltips and floating messages)
  drawGroundItemUI(ctx);

  // Rear dust/boost visuals removed per user request

  // AI: Restore the context to draw UI elements at fixed screen positions.
  ctx.restore();
  // renderInteractionPromptDOM(); // Removed per user request to disable 'E' key interactions.
  
  // Draw UI elements (keep these for now as they are UI related)
  // drawConnectionStatus(); // Removed as per edit hint


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
    try { canvas.style.imageRendering = 'pixelated'; } catch (e) {}
  
    // For now: make the canvas match the screen size (fullscreen canvas)
    // while the world size remains fixed (WORLD_WIDTH x WORLD_HEIGHT).
    const rect = canvas.getBoundingClientRect();
    game.width = rect.width;
    game.height = rect.height;
    canvas.width = game.width;
    canvas.height = game.height;

    // Initialize terrain using fixed world dimensions so the playable area
    // (WORLD_WIDTH x WORLD_HEIGHT) matches the generated world size.
    // Show loading screen and block initialization until terrain is ready.
    try {
      if (window.loadingScreen && typeof window.loadingScreen.showAreaLoading === 'function') {
        window.loadingScreen.showAreaLoading('world');
      }
      // Wait for terrain map to be assigned by setTerrainSeed -> generateTerrain
      setTerrainSeed();
      // Poll until terrain is ready with a reasonable timeout
      const start = Date.now();
      while (!game.terrain || !game.terrain.map) {
        // Avoid blocking the main thread for too long
        await new Promise(res => setTimeout(res, 50));
        if (Date.now() - start > 10000) {
          console.warn('Terrain generation taking too long, continuing anyway');
          break;
        }
      }
      if (window.loadingScreen && typeof window.loadingScreen.hide === 'function') {
        window.loadingScreen.hide();
      }
    } catch (e) {
      console.error('Terrain initialization failed:', e);
    }

    // Initialize highlight manager with the canvas
    highlightManager.init(canvas);

    // Initialize highlight event listeners for UI synchronization
    initHighlightEventListeners();

    // Initialize ground item UI enhancements
    initGroundItemUI(canvas);

    // AI: Load resource nodes from areaData.js for the current area
    const currentArea = 'beach'; // AI: Hardcoded for now, can be dynamic later
    if (areaData[currentArea] && areaData[currentArea].resourceNodes) {
      game.resourceNodes = areaData[currentArea].resourceNodes;
    }
    subscribeResourceNodes(currentArea);
    subscribeGroundItems(currentArea);

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

    // Initialize physics for the player drone
    initializeDronePhysics(game.player);

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

    // AI: Expose the game instance globally for desktop.js to access.
    window.gameInstance = game;
    
    // AI: Add mouse wheel listener for zooming with more restrictive limits.
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Discrete zoom: pick next/previous allowed zoom level
      const dir = e.deltaY > 0 ? -1 : 1;
      const allowed = (camera.allowedZooms && camera.allowedZooms.slice().sort((a,b)=>a-b)) || [1,2,3];
      // find nearest index to current targetZoom
      let idx = 0;
      for (let i = 1; i < allowed.length; i++) {
        if (Math.abs(allowed[i] - camera.targetZoom) < Math.abs(allowed[idx] - camera.targetZoom)) idx = i;
      }
      idx = Math.max(0, Math.min(allowed.length - 1, idx + dir));
      camera.targetZoom = allowed[idx];
    }, { passive: false });

    // AI: Add keyboard event listeners for camera controls
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      switch (key) {
        case 'w':
        case 'arrowup':
          camera.keysPressed.w = true;
          camera.keysPressed.up = true;
          break;
        case 'a':
        case 'arrowleft':
          // Strafe left
          camera.keysPressed.a = true;
          camera.keysPressed.left = true;
          break;
        case 's':
        case 'arrowdown':
          camera.keysPressed.s = true;
          camera.keysPressed.down = true;
          break;
        case 'd':
        case 'arrowright':
          // Strafe right
          camera.keysPressed.d = true;
          camera.keysPressed.right = true;
          break;
        case ' ': // Space bar - center on player
          e.preventDefault(); // Prevent page scroll
          camera.centerOnPlayer();
          break;
        case 'f': // F key - toggle free camera mode
          camera.toggleFreeCamera();
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      switch (key) {
        case 'w':
        case 'arrowup':
          camera.keysPressed.w = false;
          camera.keysPressed.up = false;
          break;
        case 'a':
        case 'arrowleft':
          camera.keysPressed.a = false;
          camera.keysPressed.left = false;
          break;
        case 's':
        case 'arrowdown':
          camera.keysPressed.s = false;
          camera.keysPressed.down = false;
          break;
        case 'd':
        case 'arrowright':
          camera.keysPressed.d = false;
          camera.keysPressed.right = false;
          break;
      }
    });

    // AI: Simple right-click to move system

    // AI: Add mousedown listener for right-click to move.
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { // Right mouse button
        e.preventDefault();

        // AI: Manually update mouse coords on mousedown to ensure the drone moves
        // toward the correct location even if the mouse doesn't move.
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;
        const worldCoords = screenToWorldCoords(screenX, screenY, camera);

        game.mouse.x = worldCoords.x;
        game.mouse.y = worldCoords.y;
        
        // AI: League of Legends-style enemy targeting with improved click detection
        const clickedEnemy = findNearestEnemy(worldCoords.x, worldCoords.y);
        const enemyClickRadius = clickedEnemy ? Math.max(clickedEnemy.size * 2.5, 15) : 0; // Larger click area
        
        if (clickedEnemy && Math.hypot(clickedEnemy.x - worldCoords.x, clickedEnemy.y - worldCoords.y) < enemyClickRadius) {
            // AI: Enhanced Auto-Pilot Targeting - Aggressive enemy following
            setTargetedEnemy(clickedEnemy);
            game.player.target = null; // Clear movement target - auto-pilot will handle positioning
            game.targetMarker = null; // Clear visual marker
            game.player.autoAttackTimer = AUTO_ATTACK_DURATION; // Initialize auto-attack timer
            // AI: Enable continuous movement for aggressive auto-pilot behavior
            game.player.continuousMovement = true;
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

    // Right-click movement is handled in mousedown event

    // AI: Context menu prevention is now handled in the mousedown event for right-clicks
    // This provides more reliable right-click detection without browser interference

    // AI: Basic mousemove handler for cursor tracking
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
    });
  
    // AI: Right-click interaction system (replaces 'E' key)
    // This allows manual interaction with resource nodes, ground items, and world objects.
    canvas.addEventListener('mousedown', (e) => {
      // AI: Only handle right-click (button 2)
      if (e.button !== 2) return;

      // AI: Prevent default context menu
      e.preventDefault();
      e.stopPropagation();

      

      // AI: Check if the player is currently targeting an enemy for combat
      // If so, prioritize combat and ignore interaction clicks
      const targetedEnemy = getTargetedEnemy();
      if (targetedEnemy) {

        return;
      }

      // AI: Get precise mouse coordinates relative to the canvas, accounting for canvas scaling.
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // AI: Calculate world coordinates for the click
      const worldCoords = screenToWorldCoords(mouseX, mouseY, camera);

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

      // Debug: Log resource nodes and ground items
      console.log('[DEBUG] Resource nodes count:', game.resourceNodes.length);
      console.log('[DEBUG] Ground items count:', game.groundItems.length);
      console.log('[DEBUG] Player position:', game.player.x, game.player.y);
      if (worldCoords) {
        console.log('[DEBUG] Click world coords:', worldCoords.x, worldCoords.y);
      } else {
        console.log('[DEBUG] No world coords available');
      }

      // AI: First, check if there's a currently highlighted item that should be the primary interaction target.
      // This allows users to click anywhere within the highlight outline for better UX.
      const currentHighlight = highlightManager.getCurrentHighlight();
      if (currentHighlight) {
        const highlightedEntity = currentHighlight.entity;
        const highlightType = currentHighlight.type;

        // AI: Calculate distance from player to highlighted entity
        const dist = Math.hypot(game.player.x - highlightedEntity.x, game.player.y - highlightedEntity.y);

        // AI: If the highlighted entity is within interaction range, prioritize it
        if (dist < maxInteractionRadius) {
          nearestInteractable = highlightedEntity;
          interactionType = highlightType;
          nearestDist = dist;
        }
      }

      // AI: If no highlighted item was found or it's out of range, fall back to precise mouse-over detection.
      // This maintains the original behavior while adding the highlight-based interaction.
      if (!nearestInteractable) {
        // AI: Iterate through all available resource nodes to find if the mouse is over one.
        // Resources are prioritized over ground items for interaction.
        for (const node of game.resourceNodes) {
          console.log('[DEBUG] Checking node:', node.id, 'at:', node.x, node.y);

          // AI: Skip nodes that are currently on cooldown, as they cannot be harvested.
          const isOnCooldown = node.cooldownUntil && Date.now() < node.cooldownUntil;
          if (isOnCooldown) {
            console.log('[DEBUG] Node on cooldown:', node.id);
            continue;
          }

          // AI: Calculate the world coordinates of the mouse click
          const worldCoords = screenToWorldCoords(mouseX, mouseY, camera);
          if (!worldCoords) {
            console.log('[DEBUG] No world coords for click');
            continue;
          }

          // AI: Calculate distance from mouse click to node center
          const mouseDist = Math.hypot(worldCoords.x - node.x, worldCoords.y - node.y);
          console.log('[DEBUG] Mouse distance to node:', mouseDist);

          // AI: Use a balanced click radius that's generous but not too large to avoid accidental clicks
          // Resource nodes have a highlight outline, so we use a moderate click area
          const clickRadius = 20; // Balanced click radius for precise interaction
          console.log('[DEBUG] Click radius:', clickRadius, 'Mouse dist <= radius:', mouseDist <= clickRadius);

          if (mouseDist <= clickRadius) {
                    // AI: Calculate the distance from the player's current position to the center of the resource node.
        const dist = Math.hypot(game.player.x - node.x, game.player.y - node.y);
        console.log('[DEBUG] Player distance to node:', dist, 'Max interaction radius:', maxInteractionRadius);

        // AI: If the node is within the player's interaction radius AND it's closer than any previously found interactable,
        // mark it as the current nearest interactable. This ensures the player interacts with the closest valid object.
        if (dist < maxInteractionRadius && dist < nearestDist) {
          console.log('[DEBUG] Node selected as nearest interactable:', node.id);
          nearestDist = dist;
          nearestInteractable = node;
          interactionType = 'resourceNode';
        } else {
          console.log('[DEBUG] Node out of range or farther than current nearest');
        }
          }
        }

        // AI: If no resource node was found under the mouse, check for ground items.
        if (!nearestInteractable) {
          for (const item of game.groundItems) {
            // AI: Use the world coordinates calculated above
            if (!worldCoords) continue;

            // AI: Calculate distance from mouse click to item center
            const mouseDist = Math.hypot(worldCoords.x - item.x, worldCoords.y - item.y);

            // AI: Use a very precise click radius for ground items - must click directly on sprite
            const clickRadius = 8; // Very small radius - must click precisely on the item sprite
            
            console.log('[DEBUG] Mouse distance to ground item:', mouseDist, 'Click radius:', clickRadius);

            if (mouseDist <= clickRadius) {
              // AI: If clicked on item sprite, always select it regardless of player distance
              // Player will automatically move to it if too far away
              console.log('[DEBUG] Ground item clicked precisely, selecting for interaction:', item.type);
              
              // Use click distance for priority, not player distance
              if (mouseDist < nearestDist) {
                nearestDist = mouseDist;
                nearestInteractable = item;
                interactionType = 'groundItem';
              }
            } else {
              console.log('[DEBUG] Click not precise enough for ground item - clicked outside sprite');
            }
          }
        }
      }

      // AI: If a valid interactable object was found, perform the corresponding action.
      if (nearestInteractable) {


        // AI: Clear any movement target when interacting with objects for better UX
        game.player.target = null;
        game.player.continuousMovement = false;

        if (interactionType === 'resourceNode') {


          // AI: Always deactivate any currently active mining node first
          if (game.player.activeMiningNode && game.player.activeMiningNode !== nearestInteractable) {

            game.player.activeMiningNode.active = false;
            game.player.activeMiningNode = null;
            stopLaserSound();
          }

          // AI: Now activate the new resource node (always activate, don't toggle)
          nearestInteractable.active = true;
          game.player.activeMiningNode = nearestInteractable;
          startLaserSound();

        } else if (interactionType === 'groundItem') {


          // Calculate distance to the ground item
          const distanceToItem = Math.hypot(game.player.x - nearestInteractable.x, game.player.y - nearestInteractable.y);
          const pickupRange = 32; // Must be within 32px to pick up
          


          if (distanceToItem <= pickupRange) {
            // Close enough - pick up immediately

            
            const playerId = multiplayerManager.isConnected() && multiplayerManager.localPlayer
              ? multiplayerManager.localPlayer.uid
              : 'anonymous';

            pickupGroundItem(nearestInteractable.id, playerId, game.player.x, game.player.y)
              .then(success => {
                if (success) {
      
                } else {

                }
              })
              .catch(error => {

              });
          } else {
            // Too far - move to the item

            
            // Set movement target to the ground item
            game.player.target = {
              x: nearestInteractable.x,
              y: nearestInteractable.y,
              type: 'groundItem',
              item: nearestInteractable // Store reference to the item
            };
            game.player.continuousMovement = true;
            

          }
        }
      } else {

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
              // World dimensions are fixed - no need to update them
              
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
          // World dimensions are fixed - no need to update them
          
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

    // AI: Clean up highlight manager
    highlightManager.cleanup();

    // AI: Clean up ground item UI
    cleanupGroundItemUI();

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

      // AI: Clean up highlight manager
      highlightManager.cleanup();

      // AI: Try to save experience before cleanup (use stored uid if available)
      if (user && user.uid) {
        experienceManager.saveNow(user.uid).catch((error) => {
          console.error('Failed to save experience on logout:', error);
        });
      }
    }
  });
}
