// Ground items & inventory drop/pickup
import { game } from './core.js';
import { drawPixelIcon, drawOutline } from '../data/pixelIcons.js';
import { highlightManager } from './highlightManager.js';

import { isInWater } from './world.js';
import { randi, weightedPick, clampWorldCoordinates } from '../utils/math.js';
import { items as itemDefs } from '../data/content.js';
import { playItemDropSound } from '../utils/sfx.js';

const excludedIds = new Set(['treasure_chest', 'message_in_bottle']);
const beachItems = itemDefs
  .filter(i => i.spawnable && !excludedIds.has(i.id))
  .map(i => ({ id: i.id, name: i.name, weight: i.weight ?? 1 }));

export function drawGroundItems() {
  const { ctx } = game;
  const iconScale = 1.5; // Increased scale for better visibility
  const iconSize = 12 * iconScale; // 18px
  const interactionRadius = 32;

  for (const item of game.groundItems) {
    const t = item.type || 'seashell';
    
    // Add floating animation to all ground items
    const time = Date.now() * 0.002; // Slow floating speed
    const floatOffset = Math.sin(time + item.x * 0.01 + item.y * 0.01) * 2; // 2px float amplitude
    
    // Center icon on item.x,item.y with floating animation
    const halfSize = iconSize / 2;
    const centerX = Math.round(item.x);
    const centerY = Math.round(item.y + floatOffset); // Apply floating
    const iconX = centerX - halfSize;
    const iconY = centerY - halfSize;

    // Enhanced shadow system - larger, more realistic shadow
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    // Shadow is always on the ground (not floating) and slightly offset
    const shadowY = Math.round(item.y) + halfSize * 0.8;
    const shadowSize = halfSize * 1.2; // Larger shadow
    ctx.ellipse(centerX + 1, shadowY, shadowSize, shadowSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.restore();

    // AI: The drawPixelIcon function now returns a mask of the icon's pixels.
    // This mask is used to draw a precise outline around the icon.
    const mask = drawPixelIcon(ctx, t, iconX, iconY, {
      outline: false,
      scale: iconScale
    });

    // 2. Check if this ground item is currently highlighted using the highlight manager
    if (highlightManager.isHighlighted(item)) {
      // Enhanced highlight effect with glow
      drawOutline(ctx, iconX, iconY, iconScale, mask);

      // Add subtle glow effect around highlighted items
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, halfSize + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.4)'; // Cyan glow matching drone theme
      ctx.fill();
      ctx.restore();
    }

    // 3. Stack count display with enhanced styling
    if (item.count > 1) {
      const countText = `x${item.count}`;

      // Draw background with subtle border
      ctx.save();
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      const textMetrics = ctx.measureText(countText);
      const bgWidth = Math.max(textMetrics.width + 4, 14);
      const bgHeight = 8;
      const bgX = centerX - bgWidth / 2;
      const bgY = centerY - halfSize - 10;

      // Background with subtle gradient
      const gradient = ctx.createLinearGradient(bgX, bgY, bgX, bgY + bgHeight);
      gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.6)');

      ctx.fillStyle = gradient;
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);

      // Text with subtle shadow for better readability
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(countText, centerX + 0.5, centerY - halfSize - 3.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(countText, centerX, centerY - halfSize - 4);

      ctx.restore();
    }

    // 4. Subtle pulse effect for items ready to be picked up
    // This provides additional visual feedback for nearby items
    const playerDist = Math.hypot(game.player.x - item.x, game.player.y - item.y);
    if (playerDist <= interactionRadius) {
      const pulseIntensity = 0.2 + 0.1 * Math.sin(Date.now() * 0.003);
      ctx.save();
      ctx.globalAlpha = pulseIntensity;
      ctx.beginPath();
      ctx.arc(centerX, centerY, halfSize + 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function spawnGroundItem() {
   // Random sand position, avoid water and edges
   let x = 0, y = 0, tries = 0;
   do {
     x = randi(12, game.WORLD_WIDTH - 12);
     y = randi(12, game.WORLD_HEIGHT - 12);
     tries++;
   } while ((isInWater(x, y) || Math.hypot(x - game.player.x, y - game.player.y) < 18) && tries < 20);
   // Beach items only (exclude chest and bottle), weighted
   if (!beachItems.length) return;
   const type = weightedPick(beachItems).id;
   const id = `ground_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   game.groundItems.push({ id, x, y, type, harvest: 0 });
}

// API: add a world item at an explicit world coordinate
export function addWorldItem(type, x, y, quantity = 1) {
   const t = (type || 'seashell');
   const q = Math.max(1, quantity|0);
   // Bias position to safe region if in water
   const p = clampWorldCoordinates(x, y, game, 12);
   // Try stacking with nearby same-type items
   const near = game.groundItems.find(g => g.type === t && Math.hypot(g.y - p.y, g.x - p.x) <= 18);
   if (near) {
     near.count = (near.count || 1) + q;
   } else {
     const id = `ground_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
     game.groundItems.push({ id, x: p.x, y: p.y, type: t, count: q });
     playItemDropSound();
   }
}

// API: drop items at player position
export function addWorldItemAtPlayer(type, quantity = 1) {
  const px = game.player.x;
  const py = game.player.y;
  addWorldItem(type, px, py, quantity);
}
