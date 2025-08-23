// Player movement, actions & state
// AI: The main loop now handles camera translation, so we draw at world coordinates.
import { game } from './core.js';
import { getTime } from '../utils/math.js';
import { multiplayerManager } from './multiplayerManager.js';

// DRONE DIMENSIONS (base values in pixels) and scale factor for realistic sizing
const DRONE_SCALE = 0.25; // global scale applied to the model to make it smaller in-world (half of previous)
// Use a square canopy to avoid appearing too wide from front view
const BASE_CANOPY = 22;
const DRONE_DIM = {
  CANOPY_W: Math.round(BASE_CANOPY * DRONE_SCALE),
  CANOPY_H: Math.round(BASE_CANOPY * DRONE_SCALE),
  ROTOR_R: Math.round(9 * DRONE_SCALE),
  SHADOW_OFFSET: Math.max(6, Math.round(12 * DRONE_SCALE))
};

/**
 * Draws the player character (robot) on the canvas.
 * The player's position is taken from `game.player.x` and `game.player.y`.
 */
export function drawPlayer(player) {
  const { ctx } = game; // Destructure ctx from game object
  // Round coordinates to prevent sub-pixel rendering blur
  const px = Math.round(player.x); // Get rounded player X coordinate
  const py = Math.round(player.y); // Get rounded player Y coordinate
  const angle = player.angle; // Get player angle
  const color = player.color || '#3b82f6'; // Get player color with fallback

  const time = Date.now() * 0.001;
  // Round bob value to prevent sub-pixel blur
  const bob = Math.round(Math.sin(time * 2 + (player.x + player.y) * 0.01) * 1.5);
  // AI: Draw enhanced shadow beneath the drone adjusted for hover bob
  drawDroneShadow(ctx, px, py + bob);

  // Quadcopter design (ducted propellers, canopy, skids) to match reference
  const CANOPY_W = DRONE_DIM.CANOPY_W;
  const CANOPY_H = DRONE_DIM.CANOPY_H;
  const rotorR = DRONE_DIM.ROTOR_R; // rotor radius

  // Apply body rotation first
  ctx.save();
  // Use rounded coordinates for crisp rendering
  ctx.translate(px, py + bob);
  ctx.rotate(angle + Math.PI / 2);

  // Apply body tilt for quadcopter banking/pitching. These are small rotation/skew
  // adjustments derived from `player.tiltRoll` and `player.tiltPitch` which are
  // updated in `core.js` based on velocity. We convert tilt into a subtle shear
  // and vertical offset to mimic real drone attitude changes.
  const tiltRoll = (player.tiltRoll || 0);   // roll: rotate around forward axis
  const tiltPitch = (player.tiltPitch || 0); // pitch: rotate around lateral axis

  // Convert small-angle tilts into a lightweight 2D transform: apply a slight
  // horizontal shear for roll and vertical shear for pitch. Values are clamped
  // to keep transforms subtle and performant.
  // Reduce tilt intensity for crisper rendering
  const rollShear = Math.tan(tiltRoll) * 0.15;   // reduced from 0.35 for less blur
  const pitchShear = Math.tan(tiltPitch) * 0.20; // reduced from 0.45 for less blur

  // Compose transforms: scale (global), shear (roll/pitch), then draw model
  ctx.scale(0.94, 0.94);
  // matrix: [a c e; b d f] -> ctx.transform(a, b, c, d, e, f)
  ctx.transform(1, pitchShear, rollShear, 0.76, 0, 0);

  // Apply bodyRotation computed in core.js (speed-driven spin) as a small rotation
  // underneath the turret. This keeps turret independent while the body slowly
  // rotates proportional to movement speed.
  const bodyRotation = (player.bodyRotation || 0);
  ctx.rotate(bodyRotation * 0.3); // reduced from 0.7 for less blur during movement

  const body = color || '#2ea6ff';
  const shell = darkenColor(body, 0.05);
  const rim = darkenColor(body, 0.35);
  const glass = 'rgba(230,245,255,0.98)';

  // Draw four ducted rotors positions relative to center
  const offsets = [
    { x: -CANOPY_W * 0.45, y: -CANOPY_H * 0.45 }, // top-left
    { x: CANOPY_W * 0.45, y: -CANOPY_H * 0.45 },  // top-right
    { x: -CANOPY_W * 0.45, y: CANOPY_H * 0.45 },  // bottom-left
    { x: CANOPY_W * 0.45, y: CANOPY_H * 0.45 }    // bottom-right
  ];

  // Draw ducts first (behind canopy)
  offsets.forEach((off, i) => {
    ctx.save();
    ctx.translate(off.x, off.y);
    // duct ring with highlight and shadow for depth
    const ductOuter = rotorR + Math.max(2, Math.round(3 * DRONE_SCALE));
    const ductInner = Math.max(2, rotorR - Math.round(2 * DRONE_SCALE));
    // shadow underside
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(2, 3, ductOuter, ductOuter * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // duct outer shell
    const ductGrad = ctx.createLinearGradient(-ductOuter, -ductOuter, ductOuter, ductOuter);
    ductGrad.addColorStop(0, darkenColor(rim, 0.05));
    ductGrad.addColorStop(1, darkenColor(rim, 0.35));
    ctx.fillStyle = ductGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, ductOuter, ductOuter * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    // inner rotor hub cutout (darker center)
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath();
    ctx.ellipse(0, 0, ductInner, ductInner * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // propeller blades (3-blade representation with rotation and motion blur)
    const spin = (time * 12 + i * Math.PI / 2) % (Math.PI * 2);
    ctx.save();
    ctx.rotate(spin);
    // sharper blades with reduced blur for cleaner look
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const blurCount = 2; // reduced from 3 for less blur
    for (let blur = 0; blur < blurCount; blur++) {
      ctx.globalAlpha = 0.25 * (1 - blur / blurCount); // increased alpha for more solid appearance
      for (let b = 0; b < 3; b++) {
        ctx.rotate((b === 0) ? 0 : (Math.PI * 2 / 3));
        ctx.beginPath();
        ctx.ellipse(0, -rotorR * (0.45 + blur * 0.01), rotorR * (0.9 - blur * 0.1), rotorR * (0.22 + blur * 0.02), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.restore();
  });

  // Draw central canopy (smooth molded shell)
  const canopyGrad = ctx.createLinearGradient(0, -CANOPY_H * 0.6, 0, CANOPY_H * 0.6);
  canopyGrad.addColorStop(0, lightenColor(body, 0.28));
  canopyGrad.addColorStop(0.5, body);
  canopyGrad.addColorStop(1, darkenColor(body, 0.08));

  ctx.fillStyle = canopyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, CANOPY_W / 2, CANOPY_H / 2, -0.08, 0, Math.PI * 2);
  ctx.fill();

  // glossy cockpit patch
  ctx.save();
  ctx.translate(-CANOPY_W * 0.08, -CANOPY_H * 0.08);
  ctx.fillStyle = glass;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.ellipse(0, 0, CANOPY_W * 0.32, CANOPY_H * 0.3, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // skids (scaled)
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(1, Math.round(2 * DRONE_SCALE));
  // left skid
  ctx.beginPath();
  ctx.moveTo(-CANOPY_W * 0.6, CANOPY_H * 0.6);
  ctx.lineTo(-CANOPY_W * 0.25, CANOPY_H * 0.6);
  ctx.stroke();
  // right skid
  ctx.beginPath();
  ctx.moveTo(CANOPY_W * 0.25, CANOPY_H * 0.6);
  ctx.lineTo(CANOPY_W * 0.6, CANOPY_H * 0.6);
  ctx.stroke();

  // small feet (scaled)
  ctx.fillStyle = darkenColor(rim, 0.2);
  const footR = Math.max(1, Math.round(2 * DRONE_SCALE));
  ctx.beginPath(); ctx.ellipse(-CANOPY_W * 0.45, CANOPY_H * 0.68, footR, footR, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(CANOPY_W * 0.45, CANOPY_H * 0.68, footR, footR, 0, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // --- Turret drawing: turret is independent from body rotation and follows mouse direction ---
  // Compute turret direction from the global mouse/world position if available.
  // The turret is drawn on top of the canopy and should rotate to face the cursor.
  const turretAngle = (game && game.mouse && typeof game.mouse.x === 'number')
    ? Math.atan2(game.mouse.y - player.y, game.mouse.x - player.x)
    : player.angle;

  // Draw turret — small rotating gun on top of canopy. This is purely visual: turretAngle
  // controls the turret orientation. Actual firing uses getMuzzlePosition() which now
  // references the canopy's visual front and turret orientation if needed.
  ctx.save();
  // Use rounded coordinates for turret as well
  ctx.translate(px, py + bob);
  ctx.rotate(turretAngle);
  // Make turret visually black for a stark contrast with the canopy
  ctx.fillStyle = '#0b0b0b';
  // turret base (rounded)
  roundRect(ctx, -4, -CANOPY_H * 0.4 - 4, 8, 4, 1);
  ctx.fill();
  // turret barrel (black metal)
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(3, -2, 6, 2);
  ctx.restore();

  // --- Nametag for players that include a username (remote players) ---
  try {
    if (player && player.username) {
      const name = player.username;
      ctx.save();
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tx = px;
      const ty = py - 10; // above the player

      // text only - no background for subtle appearance
      ctx.fillStyle = '#000000'; // Black text for subtlety
      ctx.fillText(name, tx, ty - 2);
      ctx.restore();
    }
  } catch (e) {
    // ignore nametag errors
  }
}

/**
 * Returns the world coordinates of the drone's muzzle (front of the barrel),
 * taking into account the same local offsets and vertical squash transform
 * used when rendering the drone so projectiles originate visually from
 * the front of the sprite.
 * @param {object} player
 */
export function getMuzzlePosition(player) {
  // Calculate muzzle position using the same local transforms applied in drawPlayer
  // Sequence in drawPlayer: Transform(a,b,c,d,0,0) -> scale(0.95,0.95) -> rotate(theta2) -> translate(px, py + bob)
  const canopyW = DRONE_DIM.CANOPY_W;
  // Permanent muzzle offset in local drone coordinates (x forward, y up)
  const MUZZLE_FORWARD = 0.42; // fraction of canopy width forward from center
  // Visual front of the canopy is to the left in local drawing (negative X), so invert
  const muzzleLocalX = -canopyW * MUZZLE_FORWARD; // negative X = forward in local drawing
  const muzzleLocalY = 0; // centered vertically on canopy
  const localY = 0;

  // Recompute bob used in drawPlayer so muzzle aligns vertically
  const time = Date.now() * 0.001;
  const bob = Math.sin(time * 2 + (player.x + player.y) * 0.01) * 1.5;

  // Simpler, robust approach: compute muzzle by rotating a forward vector by the drone's
  // visible heading. This avoids coordinate transform mismatch and ensures muzzle aligns
  // with what the player sees as the front.
  // Muzzle should track turret direction rather than body angle. Use turretAngle computed
  // from the current mouse/world position when available, otherwise fallback to body heading.
  const turretAngle = (game && game.mouse && typeof game.mouse.x === 'number')
    ? Math.atan2(game.mouse.y - player.y, game.mouse.x - player.x)
    : player.angle + Math.PI / 2 - 0.12;
  const theta = turretAngle;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);

  // Forward vector in world space
  const forwardX = cosT * muzzleLocalX - sinT * muzzleLocalY;
  const forwardY = sinT * muzzleLocalX + cosT * muzzleLocalY;

  // Compute right vector (perpendicular) so we can nudge laterally if needed
  const rightTheta = theta + Math.PI / 2;
  const rightX = Math.cos(rightTheta);
  const rightY = Math.sin(rightTheta);

  // Lateral correction to move muzzle toward drone center if it appears offset
  const lateralCorrection = DRONE_DIM.CANOPY_W * 0.08; // small nudge (pixels)

  return {
    x: player.x + forwardX + rightX * lateralCorrection,
    y: player.y + bob + forwardY + rightY * lateralCorrection
  };
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
  // Dynamic shadow based on drone altitude (game.player.height used as altitude proxy)
  const baseOffset = DRONE_DIM.SHADOW_OFFSET; // base offset at low altitude
  const playerHeight = (game && game.player && Number(game.player.height)) ? Number(game.player.height) : 20;
  // Normalize height to a reasonable range for visual scaling
  const heightNorm = Math.min(1, Math.max(0, playerHeight / 100));

  // As height increases: shadow moves further away, becomes smaller and more diffuse
  const shadowOffset = baseOffset + Math.round(playerHeight * 0.7);
  const baseWidth = Math.max(10, Math.round(24 * DRONE_SCALE));
  const baseHeight = Math.max(6, Math.round(10 * DRONE_SCALE));

  // Reduce size with altitude (up to 40% smaller)
  const shadowWidth = Math.max(6, Math.round(baseWidth * (1 - 0.4 * heightNorm)));
  const shadowHeight = Math.max(3, Math.round(baseHeight * (1 - 0.6 * heightNorm)));

  // Alpha reduces (more diffuse) as height increases
  const alpha = Math.max(0.12, 0.45 * (1 - 0.8 * heightNorm));

  ctx.save();
  // offset the shadow slightly in front to match drone tilt
  ctx.translate(px + Math.round(2 * DRONE_SCALE), py + shadowOffset);

  // Elliptical shadow with radial gradient (soft edges)
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowWidth / 2);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gradient.addColorStop(0.45, `rgba(0,0,0,${Math.max(0, alpha * 0.6)})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
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

  // Draw local player's nametag using multiplayer manager username
  try {
    const localName = (multiplayerManager && multiplayerManager.localPlayer && multiplayerManager.localPlayer.username) || null;
    if (!localName) return;

    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const tx = px;
    const ty = py - 14; // slightly higher than remote nametags

    // text only - no background for subtle appearance
    ctx.fillStyle = '#000000'; // Black text for subtlety
    ctx.fillText(localName, tx, ty - 2);
    ctx.restore();
  } catch (e) {
    // ignore
  }
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

// === HELPER FUNCTIONS FOR MODERN DRONE ===

/**
 * Lighten a hex color
 */
function lightenColor(hex, percent) {
  if (!hex || typeof hex !== 'string') return '#3b82f6';
  const num = parseInt(hex.slice(1), 16);
  if (isNaN(num)) return '#3b82f6';
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor((num >> 8 & 255) + (255 - (num >> 8 & 255)) * percent));
  const b = Math.min(255, Math.floor((num & 255) + (255 - (num & 255)) * percent));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/**
 * Darken a hex color
 */
function darkenColor(hex, percent) {
  if (!hex || typeof hex !== 'string') return '#3b82f6';
  const num = parseInt(hex.slice(1), 16);
  if (isNaN(num)) return '#3b82f6';
  const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
  const g = Math.max(0, Math.floor((num >> 8 & 255) * (1 - percent)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - percent)));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/**
 * Draw rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw alien drone body with 3D depth
 */
function drawAlienDroneBody(ctx, ox, oy, s, baseColor) {
  const time = Date.now() * 0.001;

  // === STRUCTURAL FRAME ===
  drawAlienFrame(ctx, ox, oy, s, baseColor, time);

  // === BACK LAYER - Deep structure ===
  drawAlienHullLayer(ctx, ox, oy, s, baseColor, 0.2, -0.5, 'back');

  // === MAIN STRUCTURAL LAYER ===
  drawAlienHullLayer(ctx, ox, oy, s, baseColor, 0.4, 0, 'main');

  // === FRONT LAYER - Forward facing elements ===
  drawAlienHullLayer(ctx, ox, oy, s, baseColor, 0.3, 0.3, 'front');

  // === BIOLUMINESCENT CORE ===
  drawAlienCore(ctx, ox, oy, baseColor, time);

  // === ALIEN TENDRILS ===
  drawAlienTendrils(ctx, ox, oy, baseColor, time);

  // === HOLOGRAPHIC INTERFACE ===
  drawAlienHologram(ctx, ox, oy, baseColor, time);
}

/**
 * Draw alien structural frame
 */
function drawAlienFrame(ctx, ox, oy, s, baseColor, time) {
  ctx.save();

  // Frame material - metallic with energy glow
  const frameColor = lightenColor(baseColor, 0.3);
  const glowColor = lightenColor(baseColor, 0.8);
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);

  // === MAIN STRUCTURAL BEAMS ===
  // Outer frame rectangle
  const frameWidth = s + 4;
  const frameHeight = s + 2;

  // Draw glowing frame outline
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 3 + pulse * 2;

  ctx.strokeRect(ox - frameWidth/2, oy - frameHeight/2, frameWidth, frameHeight);

  ctx.shadowBlur = 0;

  // === CORNER BRACINGS ===
  const cornerSize = 3;
  ctx.fillStyle = frameColor;

  // Top-left corner
  ctx.fillRect(ox - frameWidth/2 - 1, oy - frameHeight/2 - 1, cornerSize, cornerSize);
  // Top-right corner
  ctx.fillRect(ox + frameWidth/2 - 2, oy - frameHeight/2 - 1, cornerSize, cornerSize);
  // Bottom-left corner
  ctx.fillRect(ox - frameWidth/2 - 1, oy + frameHeight/2 - 2, cornerSize, cornerSize);
  // Bottom-right corner
  ctx.fillRect(ox + frameWidth/2 - 2, oy + frameHeight/2 - 2, cornerSize, cornerSize);

  // === CROSSBEAMS ===
  // Horizontal beam
  ctx.fillRect(ox - frameWidth/2, oy - 1, frameWidth, 2);

  // Vertical beams - left and right
  ctx.fillRect(ox - 1, oy - frameHeight/2, 2, frameHeight);
  ctx.fillRect(ox - 1 + frameWidth - 2, oy - frameHeight/2, 2, frameHeight);

  // === ENERGY NODES ===
  ctx.fillStyle = glowColor;
  const nodeSize = 1.5 + pulse * 0.5;

  // Corner energy nodes
  const corners = [
    [ox - frameWidth/2, oy - frameHeight/2], // Top-left
    [ox + frameWidth/2, oy - frameHeight/2], // Top-right
    [ox - frameWidth/2, oy + frameHeight/2], // Bottom-left
    [ox + frameWidth/2, oy + frameHeight/2]  // Bottom-right
  ];

  corners.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Midpoint energy nodes
  const midpoints = [
    [ox, oy - frameHeight/2], // Top center
    [ox, oy + frameHeight/2], // Bottom center
    [ox - frameWidth/2, oy], // Left center
    [ox + frameWidth/2, oy]  // Right center
  ];

  midpoints.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, nodeSize * 0.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // === INNER FRAME DETAILS ===
  ctx.strokeStyle = lightenColor(frameColor, 0.2);
  ctx.lineWidth = 0.5;

  // Inner frame lines
  const innerOffset = 2;
  ctx.strokeRect(
    ox - frameWidth/2 + innerOffset,
    oy - frameHeight/2 + innerOffset,
    frameWidth - innerOffset * 2,
    frameHeight - innerOffset * 2
  );

  // Diagonal cross braces for extra stability
  ctx.beginPath();
  ctx.moveTo(ox - frameWidth/2 + innerOffset, oy - frameHeight/2 + innerOffset);
  ctx.lineTo(ox + frameWidth/2 - innerOffset, oy + frameHeight/2 - innerOffset);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ox + frameWidth/2 - innerOffset, oy - frameHeight/2 + innerOffset);
  ctx.lineTo(ox - frameWidth/2 + innerOffset, oy + frameHeight/2 - innerOffset);
  ctx.stroke();

  // === ENERGY FLOW LINES ===
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 0.3;
  ctx.globalAlpha = 0.6 + pulse * 0.3;

  // Horizontal energy flow
  for (let i = 0; i < 3; i++) {
    const y = oy - frameHeight/2 + innerOffset + (frameHeight - innerOffset * 2) * (i + 1) / 4;
    ctx.beginPath();
    ctx.moveTo(ox - frameWidth/2 + innerOffset, y);
    ctx.lineTo(ox + frameWidth/2 - innerOffset, y);
    ctx.stroke();
  }

  // Vertical energy flow
  for (let i = 0; i < 3; i++) {
    const x = ox - frameWidth/2 + innerOffset + (frameWidth - innerOffset * 2) * (i + 1) / 4;
    ctx.beginPath();
    ctx.moveTo(x, oy - frameHeight/2 + innerOffset);
    ctx.lineTo(x, oy + frameHeight/2 - innerOffset);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw individual alien hull layer
 */
function drawAlienHullLayer(ctx, ox, oy, s, baseColor, alpha, offset, layer) {
  ctx.save();

  // Layer-specific transformations
  switch(layer) {
    case 'back':
      ctx.transform(0.9, 0, 0, 0.9, offset * 2, offset * 1.5);
      break;
    case 'main':
      ctx.transform(1, 0, 0, 1, 0, 0);
      break;
    case 'front':
      ctx.transform(0.95, 0, 0, 0.95, -offset, -offset * 0.5);
      break;
  }

  // Organic alien body shape
  const bodyGradient = ctx.createLinearGradient(ox, oy, ox + s, oy + s);
  const layerColor = layer === 'back' ? darkenColor(baseColor, 0.4) :
                    layer === 'front' ? lightenColor(baseColor, 0.2) : baseColor;

  bodyGradient.addColorStop(0, lightenColor(layerColor, 0.3));
  bodyGradient.addColorStop(0.3, layerColor);
  bodyGradient.addColorStop(0.7, darkenColor(layerColor, 0.2));
  bodyGradient.addColorStop(1, darkenColor(layerColor, 0.4));

  ctx.fillStyle = bodyGradient;
  ctx.globalAlpha = alpha;

  // Complex alien body shape (not just a rectangle)
  ctx.beginPath();
  // Top curve - asymmetrical alien design
  ctx.moveTo(ox + 2, oy + 1);
  ctx.bezierCurveTo(ox + 4, oy - 1, ox + 8, oy - 1, ox + 10, oy + 1);

  // Right side - organic curves
  ctx.bezierCurveTo(ox + 12, oy + 2, ox + 12, oy + 4, ox + 11, oy + 6);

  // Bottom curve - alien asymmetry
  ctx.bezierCurveTo(ox + 10, oy + 8, ox + 7, oy + 9, ox + 5, oy + 8);
  ctx.bezierCurveTo(ox + 3, oy + 9, ox + 1, oy + 7, ox + 1, oy + 5);

  // Left side - flowing alien curves
  ctx.bezierCurveTo(ox, oy + 3, ox - 1, oy + 2, ox + 2, oy + 1);
  ctx.closePath();
  ctx.fill();

  // Layer outline with metallic shine
  ctx.strokeStyle = lightenColor(layerColor, 0.5);
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = alpha * 0.6;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw alien bioluminescent core
 */
function drawAlienCore(ctx, ox, oy, baseColor, time) {
  const corePulse = 0.5 + 0.5 * Math.sin(time * 2);
  const coreGradient = ctx.createRadialGradient(
    ox + 6, oy + 4, 0,
    ox + 6, oy + 4, 3
  );

  coreGradient.addColorStop(0, lightenColor(baseColor, 0.9));
  coreGradient.addColorStop(0.3, lightenColor(baseColor, 0.6));
  coreGradient.addColorStop(0.7, baseColor);
  coreGradient.addColorStop(1, darkenColor(baseColor, 0.3));

  ctx.fillStyle = coreGradient;
  ctx.globalAlpha = 0.4 + corePulse * 0.3;

  // Core ellipse with alien proportions
  ctx.beginPath();
  ctx.ellipse(ox + 6, oy + 4, 2.5, 1.8, time, 0, Math.PI * 2);
  ctx.fill();

  // Inner energy core
  ctx.fillStyle = lightenColor(baseColor, 1);
  ctx.globalAlpha = 0.6 + corePulse * 0.4;
  ctx.beginPath();
  ctx.ellipse(ox + 6, oy + 4, 1.2, 0.8, -time, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

/**
 * Draw alien tendrils
 */
function drawAlienTendrils(ctx, ox, oy, baseColor, time) {
  ctx.strokeStyle = lightenColor(baseColor, 0.4);
  ctx.lineWidth = 0.3;
  ctx.globalAlpha = 0.5;

  // Left tendrils
  for (let i = 0; i < 2; i++) {
    const angle = time + i * Math.PI;
    const length = 2 + Math.sin(time * 1.5 + i) * 1;

    ctx.beginPath();
    ctx.moveTo(ox + 1, oy + 3 + i * 2);
    ctx.bezierCurveTo(
      ox - 1, oy + 3 + i * 2,
      ox - length, oy + 2 + i * 2 + Math.sin(angle) * 2,
      ox - length * 1.5, oy + 3 + i * 2 + Math.cos(angle) * 1.5
    );
    ctx.stroke();
  }

  // Right tendrils
  for (let i = 0; i < 2; i++) {
    const angle = time + Math.PI + i * Math.PI;
    const length = 2 + Math.cos(time * 1.5 + i) * 1;

    ctx.beginPath();
    ctx.moveTo(ox + 11, oy + 3 + i * 2);
    ctx.bezierCurveTo(
      ox + 13, oy + 3 + i * 2,
      ox + 13 + length, oy + 2 + i * 2 + Math.sin(angle) * 2,
      ox + 13 + length * 1.5, oy + 3 + i * 2 + Math.cos(angle) * 1.5
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/**
 * Draw alien holographic interface
 */
function drawAlienHologram(ctx, ox, oy, baseColor, time) {
  ctx.strokeStyle = lightenColor(baseColor, 0.7);
  ctx.lineWidth = 0.2;
  ctx.globalAlpha = 0.3;

  // Holographic rings
  for (let i = 0; i < 2; i++) {
    const ringProgress = (time * 0.5 + i * 0.3) % 1;
    const ringRadius = 3 + i * 2;

    ctx.beginPath();
    ctx.ellipse(ox + 6, oy + 4, ringRadius, ringRadius * 0.6, ringProgress * Math.PI * 2, 0, Math.PI * 1.8);
    ctx.stroke();
  }

  // Holographic data points
  ctx.fillStyle = lightenColor(baseColor, 0.8);
  for (let i = 0; i < 4; i++) {
    const angle = time * 1.2 + i * Math.PI / 2;
    const radius = 2.5 + Math.sin(time * 2 + i) * 1;
    const x = ox + 6 + Math.cos(angle) * radius;
    const y = oy + 4 + Math.sin(angle) * radius * 0.6;

    ctx.beginPath();
    ctx.arc(x, y, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}



/**
 * Draw dust effect when hovering
 */
/**
 * Draw super futuristic sci-fi thruster
 */
function drawSciFiThruster(ctx, x, y, type, baseColor, intensity, direction) {
  ctx.save();
  ctx.translate(x, y);

  // Rotate based on direction
  let rotation = 0;
  switch (direction) {
    case 'forward': rotation = 0; break;
    case 'backward': rotation = Math.PI; break;
    case 'left': rotation = -Math.PI / 2; break;
    case 'right': rotation = Math.PI / 2; break;
    case 'up': rotation = -Math.PI / 2; break;
    case 'down': rotation = Math.PI / 2; break;
  }
  ctx.rotate(rotation);

  const time = Date.now() * 0.001;
  const pulse = 0.5 + 0.5 * Math.sin(time * 8);
  const flicker = 0.8 + 0.2 * Math.random();

  // Thruster configuration based on type
  let config = {};
  switch (type) {
    case 'main':
      config = {
        size: 4,
        length: 8,
        colors: [
          lightenColor(baseColor, 0.8),  // Core white-hot
          lightenColor(baseColor, 0.6),  // Plasma blue
          baseColor,                     // Energy field
          darkenColor(baseColor, 0.3)    // Outer glow
        ],
        particleCount: 6,
        glowRadius: 3
      };
      break;

    case 'secondary':
      config = {
        size: 2.5,
        length: 5,
        colors: [
          lightenColor(baseColor, 0.7),
          lightenColor(baseColor, 0.4),
          baseColor
        ],
        particleCount: 3,
        glowRadius: 2
      };
      break;

    case 'maneuver':
      config = {
        size: 2,
        length: 4,
        colors: [
          lightenColor(baseColor, 0.5),
          baseColor,
          darkenColor(baseColor, 0.2)
        ],
        particleCount: 2,
        glowRadius: 1.5
      };
      break;

    case 'stabilizer':
      config = {
        size: 1.5,
        length: 3,
        colors: [
          lightenColor(baseColor, 0.3),
          baseColor
        ],
        particleCount: 1,
        glowRadius: 1
      };
      break;
  }

  // Apply intensity scaling
  const scale = intensity * flicker;
  const finalSize = config.size * scale;
  const finalLength = config.length * scale;

  // === ENERGY CORE ===
  const coreGradient = ctx.createLinearGradient(0, 0, finalLength, 0);
  config.colors.forEach((color, index) => {
    coreGradient.addColorStop(index / (config.colors.length - 1), color);
  });

  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.ellipse(finalLength / 2, 0, finalSize, finalSize / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // === PLASMA STREAM ===
  ctx.strokeStyle = lightenColor(baseColor, 0.6);
  ctx.lineWidth = finalSize * 0.3;
  ctx.lineCap = 'round';
  ctx.setLineDash([1, 2]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(finalLength * 1.2, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // === GLOW EFFECT ===
  const glowAlpha = Math.min(intensity * 0.4 * pulse, 0.6);
  ctx.shadowColor = lightenColor(baseColor, 0.5);
  ctx.shadowBlur = config.glowRadius * 2;
  ctx.globalAlpha = glowAlpha;
  ctx.beginPath();
  ctx.ellipse(finalLength / 2, 0, finalSize * 1.5, finalSize, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // === ENERGY PARTICLES ===
  ctx.fillStyle = lightenColor(baseColor, 0.9);
  for (let i = 0; i < config.particleCount; i++) {
    const particleProgress = (time * 2 + i * 0.5) % 1;
    const particleX = particleProgress * finalLength * 1.5;
    const particleY = (Math.random() - 0.5) * finalSize;
    const particleSize = (1 - particleProgress) * 0.8 + 0.2;

    ctx.beginPath();
    ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // === HOLOGRAPHIC RINGS ===
  if (type === 'main' && intensity > 0.7) {
    ctx.strokeStyle = lightenColor(baseColor, 0.7);
    ctx.lineWidth = 0.3;
    ctx.globalAlpha = 0.3 * pulse;

    for (let ring = 1; ring <= 2; ring++) {
      const ringRadius = finalSize + ring * 1.5;
      const ringProgress = (time * 0.5 + ring * 0.3) % 1;
      const ringAngle = ringProgress * Math.PI * 2;

      ctx.beginPath();
      ctx.ellipse(0, 0, ringRadius, ringRadius * 0.6, ringAngle, 0, Math.PI * 1.5);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawDustEffect(ctx, x, y, throttle) {
  const particleCount = Math.floor(throttle * 8);
  const time = Date.now() * 0.001;

  for (let i = 0; i < particleCount; i++) {
    // Plasma exhaust particles
    const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.6; // Spread behind
    const distance = Math.random() * 12 + 2;
    const particleX = x + Math.cos(angle) * distance;
    const particleY = y + 8 + Math.random() * 8;

    // Animated plasma particles
    const animationPhase = (time * 3 + i * 0.3) % 1;
    const particleSize = (1 - animationPhase) * 2 + 0.3;
    const alpha = (1 - animationPhase) * 0.6;

    // Plasma color gradient (blue to purple to white)
    const plasmaGradient = ctx.createRadialGradient(particleX, particleY, 0, particleX, particleY, particleSize);
    plasmaGradient.addColorStop(0, `rgba(100, 150, 255, ${alpha})`);
    plasmaGradient.addColorStop(0.5, `rgba(150, 100, 255, ${alpha * 0.8})`);
    plasmaGradient.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.3})`);

    ctx.fillStyle = plasmaGradient;
    ctx.beginPath();
    ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
    ctx.fill();

    // Add energy sparks for high throttle
    if (throttle > 0.7 && Math.random() < 0.3) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      const sparkLength = Math.random() * 3 + 1;
      const sparkAngle = angle + (Math.random() - 0.5) * Math.PI * 0.3;
      ctx.moveTo(particleX, particleY);
      ctx.lineTo(
        particleX + Math.cos(sparkAngle) * sparkLength,
        particleY + Math.sin(sparkAngle) * sparkLength
      );
      ctx.stroke();
    }
  }
}

// rear dust removed per user request

/**
 * Draw alien-like stabilizer ring
 */
function drawAlienStabilizerRing(ctx, x, y, baseColor, intensity) {
  ctx.save();
  ctx.translate(x, y);

  const time = Date.now() * 0.001;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  const ringIntensity = Math.min(intensity * pulse, 0.8);

  // Outer ring with alien glow
  const ringGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 3);
  ringGradient.addColorStop(0, lightenColor(baseColor, 0.8));
  ringGradient.addColorStop(0.3, lightenColor(baseColor, 0.4));
  ringGradient.addColorStop(0.7, baseColor);
  ringGradient.addColorStop(1, darkenColor(baseColor, 0.3));

  ctx.fillStyle = ringGradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner energy core
  ctx.fillStyle = lightenColor(baseColor, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.2, 0.8, time * 2, 0, Math.PI * 2);
  ctx.fill();

  // Energy tendrils
  ctx.strokeStyle = lightenColor(baseColor, 0.6);
  ctx.lineWidth = 0.3;
  ctx.globalAlpha = ringIntensity * 0.6;

  for (let i = 0; i < 3; i++) {
    const angle = (time * 1.5 + i * Math.PI * 2 / 3) % (Math.PI * 2);
    const tendrilLength = 2 + Math.sin(time * 2 + i) * 1;

    ctx.beginPath();
    ctx.moveTo(1.5 * Math.cos(angle), 0.8 * Math.sin(angle));
    ctx.lineTo(
      (1.5 + tendrilLength) * Math.cos(angle),
      (0.8 + tendrilLength * 0.5) * Math.sin(angle)
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
