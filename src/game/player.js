// Player movement, actions & state
// AI: The main loop now handles camera translation, so we draw at world coordinates.
import { game } from './core.js';
import { getTime } from '../utils/math.js';

/**
 * Draws the player character (robot) on the canvas.
 * The player's position is taken from `game.player.x` and `game.player.y`.
 */
export function drawPlayer(player) {
  const { ctx } = game; // Destructure ctx from game object
  const px = player.x; // Get exact player X coordinate
  const py = player.y; // Get exact player Y coordinate
  const angle = player.angle; // Get player angle
  const color = player.color; // Get player color

  // AI: Draw simple shadow beneath the drone
  drawDroneShadow(ctx, px, py);

  // AI: Drone Drawing Coordinates - scaled down to 1/4 size
  const s = 8; // Reduced from 12 to 8 for a slimmer drone
  const ox = -s / 2; // Centered origin for rotation
  const oy = -s / 2; // Centered origin for rotation

  // Save context, translate and rotate for the drone body
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle + Math.PI / 2); // Rotate to face cursor with proper sprite orientation

  // AI: Simple tilt transform for visual interest (no 2.5D)
  ctx.transform(1, 0, 0.1, 0.9, 0, 0); // Subtle skew and slight vertical compression

  // Main drone body - simplified flat design
  ctx.fillStyle = color; // Use player color as main body color
  ctx.fillRect(ox + 2, oy + 3, 8, 4); // Main body rectangle
  
  // Simple dark outline for definition
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 2, oy + 3, 8, 4);

  // Simple propellers - flat circles
  ctx.fillStyle = '#a0aec0'; // Light gray for propellers
  ctx.beginPath();
  ctx.arc(ox + 1, oy + 1, 1, 0, Math.PI * 2); // Top-left propeller
  ctx.arc(ox + 11, oy + 1, 1, 0, Math.PI * 2); // Top-right propeller
  ctx.arc(ox + 1, oy + 9, 1, 0, Math.PI * 2); // Bottom-left propeller
  ctx.arc(ox + 11, oy + 9, 1, 0, Math.PI * 2); // Bottom-right propeller
  ctx.fill();

  // Simple center sensor/eye
  ctx.fillStyle = '#22d3ee'; // Bright cyan for the center
  ctx.fillRect(ox + 5, oy + 4, 2, 2); // Small center rectangle

  // Simple gun barrel - just a small dark rectangle at the front
  ctx.fillStyle = '#2d3748'; // Dark gray for the barrel
  ctx.fillRect(ox + 5, oy + 1, 2, 1); // Small barrel at front

  // Restore context to remove transformations
  ctx.restore();
}

/**
 * Returns the world coordinates of the drone's muzzle (front of the barrel),
 * taking into account the same local offsets and vertical squash transform
 * used when rendering the drone so projectiles originate visually from
 * the front of the sprite.
 * @param {object} player
 */
export function getMuzzlePosition(player) {
  const s = 8; // drone scale used in drawing
  const ox = -s / 2;
  const oy = -s / 2;

  // Local coordinates of the barrel origin - simplified for flat design
  const localX = ox + 6; // Center of barrel (ox + 5 + 1 for barrel center)
  const localY = oy + 1; // Front of drone where barrel is

  // The drawing applies a simple tilt transform: ctx.transform(1,0,0.1,0.9,0,0)
  // Apply the same transform to the muzzle position
  const transformedX = localX;
  const transformedY = localX * 0.1 + localY * 0.9; // Apply skew transform

  // Rotation used in drawPlayer is (player.angle + PI/2)
  const theta = player.angle + Math.PI / 2;

  // Rotate local point and convert to world-space delta
  const worldDx = Math.cos(theta) * transformedX - Math.sin(theta) * transformedY;
  const worldDy = Math.sin(theta) * transformedX + Math.cos(theta) * transformedY;

  return { x: player.x + worldDx, y: player.y + worldDy };
}

// AI: Function to draw spinning propeller blades
function drawSpinningPropeller(ctx, centerX, centerY, spinAngle, blurAmount) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(spinAngle);
  
  // AI: Draw multiple blade positions for blur effect
  const bladeCount = Math.max(2, Math.floor(4 - blurAmount * 3));
  const opacity = (1 - blurAmount) / bladeCount;
  
  for (let i = 0; i < bladeCount; i++) {
    const bladeAngle = (i / bladeCount) * Math.PI;
    ctx.save();
    ctx.rotate(bladeAngle);
    
    // Draw blade
    ctx.fillStyle = `rgba(226, 232, 240, ${opacity})`;
    ctx.fillRect(-1, -0.5, 2, 1);
    ctx.fillRect(-0.5, -1, 1, 2);
    
    ctx.restore();
  }
  
  ctx.restore();
}

// AI: Simple function to draw drone shadow - tiny size for micro drone
function drawDroneShadow(ctx, px, py) {
  const shadowOffset = 12; // Distance below drone (tiny offset)
  const shadowSize = 12; // Size of shadow ellipse (tiny shadow)
  
  ctx.save();
  ctx.translate(px, py + shadowOffset);
  
  // Create elliptical shadow
  ctx.scale(1, 0.5); // Flatten shadow
  ctx.beginPath();
  ctx.arc(0, 0, shadowSize / 2, 0, Math.PI * 2);
  
  // Gradient shadow for realistic effect
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowSize / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.restore();
}

/**
 * Draws a blue arrow marker above the local player, similar to markers in games like The Sims.
 * This helps distinguish the local player from remote players.
 */
export function drawSelfMarker(player) {
  const { ctx } = game; // Destructure ctx from game object
  // AI: Draw at precise player coordinates for smooth movement (no rounding)
  const px = player.x; // Get exact player X coordinate
  const py = player.y; // Get exact player Y coordinate
  const color = player.color; // Get player color

}

/**
 * AI: Draws a visually intense, animated mining laser from the player to the active resource node.
 * This version uses a pulsing core and a soft outer glow to create a more "laser-ish" effect.
 *
 * @param {CanvasRenderingContext2D} ctx The canvas rendering context.
 * @param {object} player The player object, containing the drone's position.
 * @param {object} activeNode The resource node being mined, containing the target position.
 */
export function drawMiningLaser(ctx, player, activeNode) {
  // Exit if there's no active node to draw a laser to.
  if (!activeNode) return;

  // --- AI: Define laser start and end points ---
  // The laser should originate from the muzzle position for consistency
  const muzzle = getMuzzlePosition(player);
  const fromX = muzzle.x;
  const fromY = muzzle.y;
  const toX = activeNode.x;
  const toY = activeNode.y;

  // --- AI: Create a pulsing animation effect ---
  // A sine wave based on the current time creates a smooth, continuous pulse.
  const pulse = Math.sin(performance.now() * 0.02) * 0.5 + 0.5; // Varies between 0 and 1

  // --- AI: Draw the outer glow ---
  // This is a wider, more transparent line that gives the laser its glow.
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  // The glow's brightness pulses.
  ctx.strokeStyle = `rgba(173, 216, 230, ${0.2 + pulse * 0.3})`; // Very light blue glow
  ctx.lineWidth = 5; // Wider for a soft glow effect
  ctx.stroke();

  // --- AI: Draw the laser core ---
  // This is the bright, solid center of the laser beam.
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  // The core's brightness also pulses, but more intensely.
  ctx.strokeStyle = `rgba(220, 240, 255, ${0.8 + pulse * 0.2})`; // Bright, nearly solid white
  ctx.lineWidth = 1.5; // Thinner for a sharp core
  ctx.stroke();
}
