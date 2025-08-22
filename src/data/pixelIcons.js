// Pixel Icons (12x12) — realistic shading while preserving pixel aesthetic
// Public API remains unchanged:
// - drawPixelIcon(ctx, itemOrId, x, y, { scale, outline, shadow })
// - drawOutline(ctx, x, y, scale, mask, color)
// - createPixelIconForItem(item, { cssSize, scale })
// - getItemBounds(itemId, x, y, scale)
// - isPointInItemBounds(pointX, pointY, bounds)
// - isMouseOverItem(mouseX, mouseY, item, camera, scale)
//
// Notes:
// - Each icon is drawn into a 12x12 virtual grid via plot(px, py, w, h, color).
// - A tight ground shadow (toggle via opts.shadow) adds grounding realism.
// - The function returns the boolean mask (12x12) of filled pixels for outline/interaction uses.

import { screenToWorldCoords } from '../utils/math.js';

function drawIconInternal(ctx, id, x, y, scale, outline, colorOverride, withShadow = true) {
  const size = 12;
  const mask = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper: plot a rect in pixel-space and mark mask
  const plot = (px, py, w = 1, h = 1, color = '#6b7280') => {
    if (!ctx) return; // AI: Do not draw if context is null
    ctx.fillStyle = color;
    const rx = Math.round(x + px * scale);
    const ry = Math.round(y + py * scale);
    const rw = Math.max(1, Math.round(w * scale));
    const rh = Math.max(1, Math.round(h * scale));
    ctx.fillRect(rx, ry, rw, rh);
    for (let iy = py; iy < py + h; iy++) {
      for (let ix = px; ix < px + w; ix++) {
        if (ix >= 0 && ix < size && iy >= 0 && iy < size) mask[iy][ix] = true;
      }
    }
  };

  // Slight rounded shadow to ground the sprite
  if (withShadow && ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const rx = Math.round(x + 3 * scale);
    const ry = Math.round(y + 10 * scale);
    ctx.fillRect(rx, ry, Math.max(1, Math.round(6 * scale)), Math.max(1, Math.round(1 * scale)));
    // subtle penumbra
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(Math.round(x + 2 * scale), Math.round(y + 11 * scale), Math.max(1, Math.round(8 * scale)), Math.max(1, Math.round(1 * scale)));
  }

  // Materials/palettes
  const pal = {
    metal: { l: '#e5e7eb', m: '#9ca3af', d: '#6b7280', x: '#4b5563' },
    gold: { l: '#fde68a', m: '#fbbf24', d: '#d97706', x: '#92400e' },
    wood: { l: '#a26e45', m: '#8b5e3c', d: '#6d4a32', x: '#4a3322' },
    glass: { l: '#e0f2fe', m: '#9fd3ff', d: '#60a5fa', x: '#1d4ed8' },
    stone: { l: '#d1d5db', m: '#9ca3af', d: '#6b7280', x: '#374151' },
    sand:  { l: '#efe2c5', m: '#e7d8b0', d: '#d9c493', x: '#bca970' },
    leaf:  { l: '#58c56a', m: '#3fa34d', d: '#2f8c3e', x: '#2a6e33' },
    ui:    { paper: '#e5e7eb', ink: '#111827', sky: '#38bdf8' },
  };

  // Icon drawing
  // Icon drawing
  switch (id) {
    // App/Panel icons
    case 'inventory': {
      // A sturdy backpack for adventurers.
      const body = '#8b5e3c', bodyL = '#a26e45', bodyD = '#6d4a32';
      const strap = '#4a3322';
      plot(2, 4, 8, 6, body); // main bag
      plot(3, 3, 6, 1, bodyL); // top flap highlight
      plot(2, 9, 8, 1, bodyD); // bottom shadow
      plot(4, 2, 4, 2, body); // top flap
      plot(4, 5, 1, 3, strap); // left strap
      plot(7, 5, 1, 3, strap); // right strap
      break;
    }
    case 'equipment': {
      // A piece of chest armor.
      const F = '#6b7280', FD = '#4b5563';
      plot(3, 2, 6, 8, F);
      plot(2, 3, 1, 5, F);
      plot(9, 3, 1, 5, F);
      plot(4, 2, 4, 1, FD);  // neckline
      plot(4, 9, 4, 1, FD);  // hem
      break;
    }
    case 'skills': {
      // A crossed hammer and wrench, representing crafting and skills.
      const H = pal.wood.m, HL = pal.wood.l;
      const M = pal.metal.m, ML = pal.metal.l, MD = pal.metal.d;
      // Wrench
      plot(2, 3, 3, 2, M); // head
      plot(7, 7, 3, 2, M);
      plot(4, 5, 4, 2, M);
      plot(3, 4, 1, 1, ML);
      // Hammer
      plot(3, 8, 6, 2, MD); // head
      plot(5, 2, 2, 7, H); // handle
      plot(6, 2, 1, 7, HL);
      break;
    }
    case 'market': {
      // A market stand with an awning.
      const wood = pal.wood.m, woodD = pal.wood.d;
      const awning = '#e5e7eb', awningStripe = '#ef4444';
      plot(1, 8, 10, 2, wood); // counter
      plot(2, 3, 8, 1, awning); // awning top
      plot(2, 4, 2, 1, awningStripe);
      plot(6, 4, 2, 1, awningStripe);
      plot(2, 5, 8, 1, awning);
      plot(4, 5, 1, 1, awningStripe);
      plot(8, 5, 1, 1, awningStripe);
      plot(2, 6, 1, 3, woodD); // left post
      plot(9, 6, 1, 3, woodD); // right post
      break;
    }
    case 'chat': {
      // Rounded speech bubble with subtle tail
      const B = pal.ui.paper;
      plot(1, 2, 10, 6, B);
      plot(2, 1, 8, 8, B);
      plot(3, 8, 2, 2, B); // tail
      break;
    }

    // Skill icons used in game.html
    case 'mining': {
      // Pickaxe: wooden handle + metal head
      const H1 = pal.wood.m, H2 = pal.wood.l, MT = pal.metal.m, MD = pal.metal.d, ML = pal.metal.l;
      // handle
      plot(5, 2, 2, 7, H1);
      plot(6, 2, 1, 7, H2);
      // head
      plot(3, 4, 6, 2, MT);
      plot(3, 6, 2, 1, MD);
      plot(7, 3, 2, 1, ML);
      break;
    }
    case 'alien': {
      // Xenohunting skill icon - alien head (12x12 pixel)
      const Gd = '#1f6f3a'; // deep green
      const Gm = '#34d399'; // mid green
      const Gl = '#86efac'; // light green
      const eye = '#0b0b0b';
      const eyeL = '#ffffff';

      plot(4, 1, 4, 1, Gd); // top brow
      plot(3, 2, 6, 1, Gm);
      plot(2, 3, 8, 3, Gm);
      plot(2, 6, 2, 2, Gm);
      plot(8, 6, 2, 2, Gm);
      plot(4, 8, 4, 1, Gd);
      plot(4, 2, 2, 1, Gl);
      plot(6, 2, 2, 1, Gl);
      plot(3, 4, 2, 1, Gl);
      plot(7, 4, 2, 1, Gl);
      plot(4, 4, 2, 2, eye);
      plot(8, 4, 2, 2, eye);
      plot(4, 4, 1, 1, eyeL);
      plot(8, 4, 1, 1, eyeL);
      break;
    }
    case 'fishing': {
      const H = pal.wood.m, HL = pal.wood.l, MT = pal.metal.m;
      plot(2, 2, 1, 8, H);
      plot(3, 2, 1, 6, HL);
      plot(6, 2, 1, 6, '#cbd5e1');
      plot(6, 8, 2, 1, MT);
      plot(7, 9, 1, 1, MT);
      break;
    }
    case 'gathering': {
      const G1 = pal.leaf.m, G2 = pal.leaf.l, G3 = pal.leaf.d;
      plot(5, 3, 2, 6, G1); // stem
      plot(3, 4, 2, 2, G2); // leaf left
      plot(7, 5, 2, 2, G3); // leaf right
      plot(4, 6, 2, 2, G2); // leaf mid-left
      break;
    }

    // Equipment slots
    case 'helmet': {
      const ML = pal.metal.l, MM = pal.metal.m, MD = pal.metal.d;
      plot(3, 3, 6, 1, ML);
      plot(2, 4, 8, 3, MM);
      plot(3, 7, 6, 1, MD);
      plot(5, 5, 2, 1, '#000'); // visor slit
      break;
    }
    case 'chest': {
      const F = '#6b7280', FD = '#4b5563';
      plot(3, 2, 6, 8, F);
      plot(2, 3, 1, 5, F);
      plot(9, 3, 1, 5, F);
      plot(4, 2, 4, 1, FD);  // neckline
      plot(4, 9, 4, 1, FD);  // hem
      break;
    }
    case 'arms': {
      const MM = pal.metal.m, MD = pal.metal.d;
      plot(3, 4, 6, 2, MM);
      plot(4, 6, 4, 2, MM);
      plot(5, 8, 2, 1, MD);
      plot(3, 5, 1, 1, MD);
      plot(8, 5, 1, 1, MD);
      break;
    }
    case 'legs': {
      const MM = pal.metal.m, MD = pal.metal.d;
      plot(4, 3, 4, 6, MM);
      plot(3, 4, 1, 4, MM);
      plot(8, 4, 1, 4, MM);
      plot(4, 8, 4, 1, MD);
      break;
    }
    case 'ring': {
      const GL = pal.gold.l, GM = pal.gold.m, GD = pal.gold.d;
      plot(4, 5, 4, 4, GM);
      plot(5, 6, 2, 2, GD);
      plot(5, 5, 2, 1, GL);
      break;
    }
    case 'amulet': {
      const CH = pal.metal.m, GEM = '#0ea5e9';
      plot(4, 3, 4, 1, CH);
      plot(5, 4, 2, 2, GEM);
      plot(4, 6, 4, 1, CH);
      break;
    }

    // Tools and world items
    case 'shovel': {
      const H = pal.wood.m, HL = pal.wood.l, MT = pal.metal.m, MD = pal.metal.d;
      plot(5, 2, 2, 7, H);
      plot(6, 2, 1, 7, HL);
      plot(4, 8, 4, 1, MT);
      plot(3, 9, 6, 1, MT);
      plot(4, 10, 4, 1, MD);
      plot(5, 11, 2, 1, MD);
      break;
    }
    case 'sand': {
      const L = pal.sand.l, M = pal.sand.m, D = pal.sand.d, X = pal.sand.x;
      plot(2, 7, 8, 3, M);
      plot(3, 6, 6, 5, M);
      plot(4, 6, 4, 1, L);
      plot(5, 5, 2, 1, L);
      plot(3, 7, 6, 1, D);
      plot(2, 9, 8, 1, X);
      break;
    }
    case 'sandstone': {
      const L = pal.sand.l, M = pal.sand.m, D = pal.sand.d;
      plot(3, 7, 6, 2, M);
      plot(2, 8, 8, 1, D);
      plot(4, 6, 4, 1, M);
      plot(5, 5, 2, 1, L);
      plot(3, 8, 1, 1, '#bfae7a');
      plot(8, 8, 1, 1, '#bfae7a');
      break;
    }
    case 'seaweed': {
      const G1 = pal.leaf.m, G2 = pal.leaf.d, G3 = pal.leaf.x, HL = pal.leaf.l;
      plot(4, 3, 2, 6, G2);
      plot(6, 2, 2, 8, G1);
      plot(8, 4, 2, 5, G3);
      plot(6, 2, 1, 1, HL);
      plot(4, 3, 1, 1, HL);
      break;
    }
    case 'driftwood': {
      const B = pal.wood.m, BL = pal.wood.l, BD = pal.wood.d, K = pal.wood.x;
      plot(2, 6, 8, 2, B);
      plot(3, 5, 6, 4, B);
      plot(4, 5, 1, 1, BL);
      plot(8, 6, 1, 1, BL);
      plot(3, 6, 1, 1, K);
      plot(6, 7, 1, 1, BD);
      break;
    }
    case 'seashell': {
      const L = '#f7e1bf', M = '#f2d3a2', D = '#e7c38f', X = '#c89c6a';
      plot(3, 5, 6, 5, M);
      plot(4, 4, 4, 7, M);
      plot(3, 8, 6, 2, D);
      plot(4, 9, 4, 1, X);
      plot(5, 5, 1, 4, X);
      plot(7, 5, 1, 4, X);
      plot(4, 4, 1, 1, L);
      plot(7, 4, 1, 1, L);
      break;
    }
    case 'treasure_chest': {
      const W = pal.wood.m, WD = pal.wood.d, TR = pal.gold.m, LK = pal.metal.l;
      plot(2, 5, 8, 5, W);
      plot(2, 4, 8, 1, WD);
      plot(2, 5, 8, 1, TR);
      plot(2, 9, 8, 1, TR);
      plot(5, 6, 2, 2, LK);
      break;
    }
    case 'message_in_bottle': {
      const GL = pal.glass.m, GHL = pal.glass.l, CK = pal.wood.l, P = '#f7e1bf';
      plot(4, 2, 4, 8, GL);
      plot(5, 1, 2, 1, CK);
      plot(5, 3, 1, 6, GHL);
      plot(5, 5, 2, 3, P);
      break;
    }
    case 'stone': {
      const L = pal.stone.l, M = pal.stone.m, D = pal.stone.d, X = pal.stone.x;
      plot(3, 6, 6, 3, M);
      plot(4, 5, 4, 5, M);
      plot(3, 8, 6, 1, D);
      plot(7, 6, 2, 2, D);
      plot(4, 5, 1, 1, L);
      plot(5, 6, 1, 1, X);
      break;
    }
    case 'stone_deposit': {
      const L = pal.stone.l, M = pal.stone.m, D = pal.stone.d, X = pal.stone.x;
      plot(1, 5, 10, 5, M);
      plot(2, 4, 8, 7, M);
      plot(3, 3, 6, 9, M);
      plot(2, 9, 8, 2, D);
      plot(9, 5, 2, 4, D);
      plot(3, 4, 1, 1, D);
      plot(4, 6, 1, 3, X);
      plot(7, 5, 2, 1, X);
      plot(2, 7, 1, 1, X);
      plot(9, 8, 1, 1, X);
      plot(3, 3, 3, 1, L);
      plot(2, 4, 1, 2, L);
      plot(6, 4, 1, 1, L);
      break;
    }
    case 'wood': {
      const B1 = pal.wood.m, B2 = pal.wood.l, BD = pal.wood.d;
      plot(2, 5, 8, 4, B1);
      plot(3, 4, 6, 6, B1);
      plot(3, 5, 1, 4, B2);
      plot(8, 5, 1, 4, B2);
      plot(4, 6, 4, 2, BD);
      break;
    }
    case 'coin':
    case 'galactic_token': {
      const CYAN = '#00FFFF', BLUE = '#0080FF', WHITE = '#FFFFFF', DARK_BLUE = '#003366';
      plot(5, 3, 2, 1, CYAN);
      plot(4, 4, 1, 1, CYAN);
      plot(7, 4, 1, 1, CYAN);
      plot(3, 5, 1, 2, CYAN);
      plot(8, 5, 1, 2, CYAN);
      plot(4, 7, 1, 1, CYAN);
      plot(7, 7, 1, 1, CYAN);
      plot(5, 8, 2, 1, CYAN);
      plot(5, 5, 2, 2, WHITE);
      plot(5, 2, 2, 1, BLUE);
      plot(3, 4, 1, 1, BLUE);
      plot(8, 4, 1, 1, BLUE);
      plot(2, 5, 1, 2, BLUE);
      plot(9, 5, 1, 2, BLUE);
      plot(3, 7, 1, 1, BLUE);
      plot(8, 7, 1, 1, BLUE);
      plot(5, 9, 2, 1, BLUE);
      break;
    }
    case 'grip': {
      const dot = '#4b5563';
      plot(3, 4, 1, 1, dot);
      plot(6, 4, 1, 1, dot);
      plot(9, 4, 1, 1, dot);
      plot(3, 7, 1, 1, dot);
      plot(6, 7, 1, 1, dot);
      plot(9, 7, 1, 1, dot);
      break;
    }
    case 'sound-on': {
      const S = pal.metal.l;
      plot(2, 4, 3, 4, S);
      plot(5, 2, 2, 8, S);
      plot(7, 4, 1, 4, S);
      plot(8, 5, 1, 2, S);
      break;
    }
    case 'sound-off': {
      const S = pal.metal.l, X = '#ef4444';
      plot(2, 4, 3, 4, S);
      plot(5, 2, 2, 8, S);
      plot(7, 3, 2, 6, X);
      plot(8, 4, 1, 4, X);
      plot(9, 5, 1, 2, X);
      break;
    }
    case 'gear': {
      const M = pal.metal.m, ML = pal.metal.l, MD = pal.metal.d;
      plot(4, 2, 4, 1, M);
      plot(2, 4, 1, 4, M);
      plot(9, 4, 1, 4, M);
      plot(4, 9, 4, 1, M);
      plot(4, 4, 4, 4, MD);
      plot(5, 5, 2, 2, ML);
      break;
    }
    case 'pickaxe': {
      const H = pal.wood.m, HL = pal.wood.l;
      const M = pal.metal.m, ML = pal.metal.l, MD = pal.metal.d;
      plot(5, 2, 2, 7, H); // handle
      plot(6, 2, 1, 7, HL);
      plot(3, 4, 6, 2, M); // head
      plot(2, 3, 1, 2, ML);
      plot(9, 3, 1, 2, ML);
      plot(3, 6, 1, 1, MD);
      plot(8, 6, 1, 1, MD);
      break;
    }
    case 'fishing_pole': {
      const H = pal.wood.m, HL = pal.wood.l;
      const S = '#e5e7eb';
      plot(2, 2, 1, 8, H); // handle
      plot(3, 2, 1, 8, HL);
      plot(4, 2, 1, 6, S); // line
      plot(4, 8, 2, 1, S); // hook
      plot(5, 9, 1, 1, S);
      break;
    }
    default: {
      const color = colorOverride || '#6b7280';
      plot(3, 4, 3, 3, color);
      plot(6, 5, 3, 3, color);
      plot(4, 7, 4, 2, color);
      plot(4, 4, 1, 1, 'rgba(255,255,255,0.35)');
    }
  }

  return mask;
}

export function drawOutline(ctx, x, y, scale, mask, color = 'rgba(56, 189, 248, 0.95)') {
  const size = 12;
  const outlineMask = Array.from({ length: size }, () => Array(size).fill(false));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (mask[r][c]) {
        if (r > 0 && !mask[r - 1][c]) outlineMask[r - 1][c] = true;
        if (r < size - 1 && !mask[r + 1][c]) outlineMask[r + 1][c] = true;
        if (c > 0 && !mask[r][c - 1]) outlineMask[r][c - 1] = true;
        if (c < size - 1 && !mask[r][c + 1]) outlineMask[r][c + 1] = true;
        if (r > 0 && c > 0 && !mask[r - 1][c - 1]) outlineMask[r - 1][c - 1] = true;
        if (r > 0 && c < size - 1 && !mask[r - 1][c + 1]) outlineMask[r - 1][c + 1] = true;
        if (r < size - 1 && c > 0 && !mask[r + 1][c - 1]) outlineMask[r + 1][c - 1] = true;
        if (r < size - 1 && c < size - 1 && !mask[r + 1][c + 1]) outlineMask[r + 1][c + 1] = true;
      }
    }
  }
  ctx.fillStyle = color;
  const pixelSize = Math.max(1, Math.round(scale));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (outlineMask[r][c] && !mask[r][c]) {
        const rx = Math.round(x + c * scale);
        const ry = Math.round(y + r * scale);
        ctx.fillRect(rx, ry, pixelSize, pixelSize);
      }
    }
  }
}

export function drawPixelIcon(ctx, itemOrId, x, y, opts = {}) {
  // Resolve id: accept string, or object with `icon` or `id`.
  let id;
  if (typeof itemOrId === 'string') {
    id = itemOrId;
  } else if (itemOrId && typeof itemOrId === 'object') {
    // Prefer explicit `icon` field. If it's an SVG path like '/icons.svg#icon-seashell',
    // extract the fragment after '#'. Otherwise, use the value directly or fallback to `id`.
    const iconField = itemOrId.icon || itemOrId.id || 'unknown';
    if (typeof iconField === 'string' && iconField.includes('#')) {
      id = iconField.split('#').pop();
    } else if (typeof iconField === 'string' && iconField.includes('/')) {
      // If icon is a path without fragment, try last path segment (e.g. 'assets/icons/pickaxe')
      id = iconField.split('/').pop();
    } else {
      id = String(iconField);
    }
  } else {
    id = 'unknown';
  }

  const scale = opts.scale || 1;
  const outline = !!opts.outline;
  // Properly resolve color: prefer opts.color, then item.color if item object provided.
  const color = (opts.color !== undefined) ? opts.color : (typeof itemOrId === 'object' ? itemOrId.color : undefined);
  return drawIconInternal(ctx, id, x, y, scale, outline, color, opts.shadow !== false);
}

export function createPixelIconForItem(item, opts = {}) {
  const size = 12;
  const cssSize = opts.cssSize ?? 40;
  const scale = opts.scale ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.classList.add('pixel-icon');
  const ctx = canvas.getContext('2d');
  drawPixelIcon(ctx, item, 0, 0, { scale, outline: false, shadow: true });
  return canvas;
}

/**
 * Calculate the precise bounding box for an item based on its icon mask
 * @param {string} itemId - The item ID
 * @param {number} x - World x coordinate of item center
 * @param {number} y - World y coordinate of item center
 * @param {number} scale - Icon scale factor
 * @returns {Object} Bounding box {left, top, right, bottom, width, height}
 */
export function getItemBounds(itemId, x, y, scale = 1.5) {
  const size = 12;
  const iconSize = size * scale;
  const halfSize = iconSize / 2;

  // Get the icon mask to calculate precise bounds
  const mask = drawIconInternal(null, itemId, 0, 0, scale, false, null, true);

  // Find the actual filled pixel bounds in the mask
  let minX = size, maxX = 0, minY = size, maxY = 0;
  let hasPixels = false;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (mask[py][px]) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        hasPixels = true;
      }
    }
  }

  // If no pixels found, fall back to full icon bounds
  if (!hasPixels) {
    minX = 0; maxX = size - 1; minY = 0; maxY = size - 1;
  }

  // Add shadow bounds (shadow extends 2px beyond icon bounds)
  const shadowLeft = 2;
  const shadowRight = 8;
  const shadowBottom = 11;
  const shadowTop = 3;

  minX = Math.min(minX, shadowLeft);
  maxX = Math.max(maxX, shadowRight);
  minY = Math.min(minY, shadowTop);
  maxY = Math.max(maxY, shadowBottom);

  // Convert to world coordinates
  const worldLeft = x - halfSize + minX * scale;
  const worldTop = y - halfSize + minY * scale;
  const worldRight = x - halfSize + (maxX + 1) * scale;
  const worldBottom = y - halfSize + (maxY + 1) * scale;

  return {
    left: worldLeft,
    top: worldTop,
    right: worldRight,
    bottom: worldBottom,
    width: worldRight - worldLeft,
    height: worldBottom - worldTop,
    centerX: x,
    centerY: y
  };
}

/**
 * Check if a point is inside an item's precise bounding box
 * @param {number} pointX - X coordinate of the point
 * @param {number} pointY - Y coordinate of the point
 * @param {Object} bounds - Bounding box from getItemBounds
 * @returns {boolean} True if point is inside bounds
 */
export function isPointInItemBounds(pointX, pointY, bounds) {
  return pointX >= bounds.left &&
         pointX <= bounds.right &&
         pointY >= bounds.top &&
         pointY <= bounds.bottom;
}

/**
 * Check if mouse is over an item using precise bounds
 * @param {number} mouseX - Mouse X coordinate (screen space)
 * @param {number} mouseY - Mouse Y coordinate (screen space)
 * @param {Object} item - Ground item object
 * @param {Object} camera - Camera object for coordinate conversion
 * @param {number} scale - Icon scale factor
 * @returns {boolean} True if mouse is over the item
 */
export function isMouseOverItem(mouseX, mouseY, item, camera, scale = 1.5) {
  // Convert screen coordinates to world coordinates
  const worldCoords = screenToWorldCoords(mouseX, mouseY, camera);
  if (!worldCoords) return false;

  // Get precise item bounds
  const bounds = getItemBounds(item.type || 'seashell', item.x, item.y, scale);

  // Check if mouse is within bounds
  return isPointInItemBounds(worldCoords.x, worldCoords.y, bounds);
}


