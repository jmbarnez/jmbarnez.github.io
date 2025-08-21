// Ground items & inventory drop/pickup
import { game } from './core.js';
import { drawPixelIcon } from '../data/pixelIcons.js';

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
  const interactionRadius = 24;
  
  for (const item of game.groundItems) {
    const t = item.type || 'seashell';
    // Center icon on item.x,item.y
    const halfSize = iconSize / 2;
    // AI: The drawPixelIcon function now returns a mask of the icon's pixels.
    // This mask is used to draw a precise outline around the icon.
    const mask = drawPixelIcon(ctx, t, Math.round(item.x) - halfSize, Math.round(item.y) - halfSize, {
      outline: false,
      scale: iconScale
    });

    // AI: Check if the DOM element for this item is marked as highlighted.
    // If it is, draw a precise outline around the item using the mask.
    const domElement = document.getElementById(`ground-item-${item.x}_${item.y}_${item.type}`);
    if (domElement && domElement.dataset.highlighted === 'true') {
      drawOutline(ctx, Math.round(item.x) - halfSize, Math.round(item.y) - halfSize, iconScale, mask);
    }


    // AI: Display stack count for items on the ground, much smaller and above the item icon.
    if (item.count > 1) {
      // Draw a tiny label above the item icon
      ctx.save();
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(item.x - 8, item.y - halfSize - 12, 16, 10);
      ctx.fillStyle = '#fff';
      ctx.fillText(`x${item.count}`, item.x, item.y - halfSize - 4);
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
  game.groundItems.push({ x, y, type, harvest: 0 });
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
    game.groundItems.push({ x: p.x, y: p.y, type: t, count: q });
    playItemDropSound();
  }
}

// API: drop items at player position
export function addWorldItemAtPlayer(type, quantity = 1) {
  const px = game.player.x;
  const py = game.player.y;
  addWorldItem(type, px, py, quantity);
}
