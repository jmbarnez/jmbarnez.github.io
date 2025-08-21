// Resource node management (spawn, subscribe, harvest)
import { game } from './core.js';
import { drawPixelIcon } from '../data/pixelIcons.js';

import { isInWater } from './world.js';
// AI: Added 'onValue' to create a single, robust listener for resource node data.
import { randi } from '../utils/math.js';
import { database } from '../utils/firebaseClient.js';
import { ref, get, set, update, runTransaction, serverTimestamp, onValue } from 'firebase/database';
import { areaData } from '../data/areaData.js';
import { resourceConfigs } from '../data/resourceConfigs.js';

export function getResourceConfig(type) {
  return resourceConfigs[type] || resourceConfigs.default;
}

export function drawResourceNodes() {
  const { ctx } = game;
  const iconScale = 2.0; // Larger scale for resource nodes
  const iconSize = 12 * iconScale; // 24px
  // Tiny progress bar config (cute bar above the node)
  // AI: Reduced the size of the progress bars to make them tinier.
  const barWidth = 20;
  const barHeight = 3;
  const barRadius = 1;
  const interactionRadius = 24;

  for (const node of game.resourceNodes) {
    const t = node.type;
    // AI: The displayType mapping has been removed to directly use the node's type.
    // This ensures that 'sandstone' and 'stone_deposit' are rendered with their correct icons.
    
    // Center icon on node.x,node.y
    const halfSize = iconSize / 2;
    // Add simple 3D shading by drawing a subtle highlight and extra shadow layers
    const baseX = Math.round(node.x) - halfSize;
    const baseY = Math.round(node.y) - halfSize;

    // Draw subtle ambient occlusion below the node
    ctx.beginPath();
    ctx.ellipse(node.x, node.y + halfSize * 0.6, halfSize * 0.9, halfSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // Slight rim highlight (top-left) to give volume
    ctx.beginPath();
    ctx.ellipse(node.x - halfSize * 0.25, node.y - halfSize * 0.25, halfSize * 0.9, halfSize * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();

    // AI: The drawPixelIcon function returns a mask of the icon's pixels.
    const mask = drawPixelIcon(ctx, t, baseX, baseY, {
      outline: false,
      scale: iconScale,
      shadow: false // we've drawn custom shadow/highlight
    });

    // AI: Check if the DOM element for this resource node is marked as highlighted.
    // If it is, draw a precise outline around the node using the mask.
    const domElement = document.getElementById(`resource-node-${node.x}_${node.y}_${node.type}`);
    if (domElement && domElement.dataset.highlighted === 'true') {
      drawOutline(ctx, baseX, baseY, iconScale, mask);
    }

    // Draw a top-light to simulate sun from top-left
    ctx.save();
    // Clip to icon mask to avoid painting outside
    const px = baseX, py = baseY, ps = 12 * iconScale;
    ctx.beginPath();
    // Create clip from mask pixels (fast approx: use rounded rect around icon)
    ctx.rect(px, py, ps, ps);
    ctx.clip();
    // Gradient highlight
    const grad = ctx.createLinearGradient(px, py, px + ps, py + ps);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, ps, ps);
    ctx.restore();


    
    // Active harvesting glow effect
    if (node.active) {
      // const t = (performance.now() / 600) % 1;
      // const alpha = 0.4 + 0.3 * Math.sin(t * Math.PI * 2);
      // ctx.strokeStyle = `rgba(34,211,238,${alpha})`;
      // ctx.lineWidth = 2;
      // const r = Math.round(halfSize + 3);
      // ctx.strokeRect(Math.round(node.x - r), Math.round(node.y - r), r * 2, r * 2);
    }

    // Show progress bar when actively harvesting
    if (node.active) {
      // Look up per-resource timing configuration
      const cfg = getResourceConfig(node.type || 'default');
      const duration = (cfg.cycleMs || 1700) / 1000; // seconds per harvest cycle

      // Determine how many cycles are required for this node type
      const cyclesNeeded = cfg.cyclesNeeded || 1;

      // Progress within the current visual cycle (0..1)
      const cycleProgress = Math.max(0, Math.min(1, (node.t || 0) / duration));

      // Only completed cycles contribute to the overall progress bar. The
      // overall/top bar should NOT interpolate during the current cycle; it
      // should step when a cycle completes. Use harvestProgress (completed cycles)
      // to compute the overall progress.
      const completedCycles = node.harvestProgress || 0;
      const totalProgress = Math.max(0, Math.min(1, (completedCycles) / cyclesNeeded));

      const bx = Math.round(node.x - barWidth / 2);
      const by = Math.round(node.y - halfSize - 8);

      // Track (background)
      ctx.beginPath();
      ctx.moveTo(bx + barRadius, by);
      ctx.lineTo(bx + barWidth - barRadius, by);
      ctx.quadraticCurveTo(bx + barWidth, by, bx + barWidth, by + barRadius);
      ctx.lineTo(bx + barWidth, by + barHeight - barRadius);
      ctx.quadraticCurveTo(bx + barWidth, by + barHeight, bx + barWidth - barRadius, by + barHeight);
      ctx.lineTo(bx + barRadius, by + barHeight);
      ctx.quadraticCurveTo(bx, by + barHeight, bx, by + barHeight - barRadius);
      ctx.lineTo(bx, by + barRadius);
      ctx.quadraticCurveTo(bx, by, bx + barRadius, by);
      ctx.closePath();
      ctx.fillStyle = 'rgba(15,23,42,0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(56,189,248,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Draw an overall progress indicator (multi-cycle progress).
      // This is a thin bar above the main cycle bar that fills according to
      // totalProgress (completedCycles + current cycle) / cyclesNeeded.
      const overallBarHeight = 3;
      // Place overall bar directly above the main cycle bar (no extra gap)
      const overallBy = by - overallBarHeight; 
      const overallFx = bx + 1;
      const overallFy = overallBy + 1;
      const overallFw = Math.max(0, Math.min(barWidth - 2, Math.floor((barWidth - 2) * totalProgress)));
      // Background for overall bar
      ctx.beginPath();
      ctx.moveTo(bx + barRadius, overallBy);
      ctx.lineTo(bx + barWidth - barRadius, overallBy);
      ctx.quadraticCurveTo(bx + barWidth, overallBy, bx + barWidth, overallBy + barRadius);
      ctx.lineTo(bx + barWidth, overallBy + overallBarHeight - barRadius);
      ctx.quadraticCurveTo(bx + barWidth, overallBy + overallBarHeight, bx + barWidth - barRadius, overallBy + overallBarHeight);
      ctx.lineTo(bx + barRadius, overallBy + overallBarHeight);
      ctx.quadraticCurveTo(bx, overallBy + overallBarHeight, bx, overallBy + overallBarHeight - barRadius);
      ctx.lineTo(bx, overallBy + barRadius);
      ctx.quadraticCurveTo(bx, overallBy, bx + barRadius, overallBy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(2,6,23,0.6)';
      ctx.fill();
      // Fill overall progress
      if (overallFw > 0) {
        ctx.fillStyle = 'rgba(99,102,241,0.95)'; // indigo-ish for overall progress
        ctx.fillRect(overallFx, overallFy, overallFw, overallBarHeight - 2);
      }

      // Fill (current cycle progress) - visually larger main bar
      const prog = cycleProgress; // show current cycle progress inside main bar
      if (prog > 0) {
        const fx = bx + 1;
        const fy = by + 1;
        const fw = Math.max(0, Math.min(barWidth - 2, Math.floor((barWidth - 2) * prog)));
        const fh = barHeight - 2;
        const rr = Math.max(0, barRadius - 1);
        ctx.beginPath();
        ctx.moveTo(fx + rr, fy);
        ctx.lineTo(fx + fw - rr, fy);
        ctx.quadraticCurveTo(fx + fw, fy, fx + fw, fy + rr);
        ctx.lineTo(fx + fw, fy + fh - rr);
        ctx.quadraticCurveTo(fx + fw, fy + fh, fx + fw - rr, fy + fh);
        ctx.lineTo(fx + rr, fy + fh);
        ctx.quadraticCurveTo(fx, fy + fh, fx, fy + fh - rr);
        ctx.lineTo(fx, fy + rr);
        ctx.quadraticCurveTo(fx, fy, fx + rr, fy);
        ctx.closePath();
        // Yellow progress bar for cycle
        ctx.fillStyle = 'rgba(251,191,36,0.95)'; // amber-400
        ctx.fill();
      }
    }
  }
}

export function spawnResourceNode(type) {
  // Random sand position, avoid water and edges
  let x = 0, y = 0, tries = 0;
  do {
    x = randi(20, game.width - 20);
    y = randi(20, game.height - 20);
    tries++;
  } while ((isInWater(x, y) || Math.hypot(x - game.player.x, y - game.player.y) < 30) && tries < 20);
  
  const id = `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  game.resourceNodes.push({
    id,
    x,
    y,
    type,
    harvest: 0,
    harvestedBy: null,
    lastHarvested: 0
  });
}

export function spawnIdleNode(type = 'sand_mound') {
  // place on sand away from water and edges
  let x = 0, y = 0, tries = 0;
  do {
    x = randi(20, game.width - 20);
    y = randi(20, game.height - 20);
    tries++;
  } while ((isInWater(x, y) || Math.hypot(x - game.player.x, y - game.player.y) < 24) && tries < 30);
  game.idleNodes.push({ x, y, type, active: false, t: 0 });
}

export async function harvestNode(areaId, nodeId, uid, cooldownMs) {
  // AI: Enhanced harvest with multi-cycle support for specific node types.
  // Returns an object { committed, dropped, snapshot } where `dropped` is true
  // only when the node produced an item for this harvest call.
  const nodeRef = ref(database, `areas/${areaId}/resources/${nodeId}`);
  const now = Date.now();

  const res = await runTransaction(nodeRef, (node) => {
    if (!node) {
      // Initialize node if missing
      return {
        type: 'wood',
        harvestProgress: 0,
        cooldownUntil: 0,
        lastHarvested: 0,
        lastHarvestedBy: null,
      };
    }

    // Abort if still cooling down
    if (node.cooldownUntil && now < node.cooldownUntil) {
      return node; // no-op -> transaction not committed
    }

    // Determine cycles needed using centralized config so server & client agree
    const cfg = getResourceConfig(node.type || 'default');
    const cyclesNeeded = cfg.cyclesNeeded || 1;

    // Increment progress (treat harvestProgress as completed cycles count)
    const progress = (node.harvestProgress || 0) + 1;

    if (progress < cyclesNeeded) {
      // Not ready yet: increment progress and persist progress only.
      // Do NOT set a cooldown so subsequent cycles can occur naturally.
      node.harvestProgress = progress;
      return node;
    }

    // Ready to drop: reset progress, record harvest metadata and set cooldown
    node.harvestProgress = 0;
    node.lastHarvested = serverTimestamp();
    node.lastHarvestedBy = uid;
    // Use cfg cycle duration for cooldown if provided (fallback to provided cooldownMs)
    const cooldownToUse = cfg.cycleMs || cooldownMs;
    node.cooldownUntil = now + (cooldownToUse || cooldownMs);
    return node;
  });

  const snapshotVal = res && res.snapshot ? res.snapshot.val() : null;
  // Dropped if transaction committed and the progress was reset and the lastHarvestedBy matches requester
  const dropped = !!(res.committed && snapshotVal && snapshotVal.harvestProgress === 0 && snapshotVal.lastHarvestedBy === uid);
  return { committed: !!res.committed, dropped, snapshot: snapshotVal };
}

  export function ensureAreaSeeded(areaId) {
    // AI: This function now acts as a "sync" rather than a one-time seed.
    // It guarantees that the Firebase database reflects the exact resource layout
    // defined in `areaData.js`, overwriting any existing data. This makes the
    // code the single source of truth for resource locations.
    const areaRef = ref(database, `areas/${areaId}`);
    const updates = {};
    const areaLayout = areaData[areaId];

    if (areaLayout && areaLayout.resourceNodes) {
      areaLayout.resourceNodes.forEach(node => {
        // AI: Prepare a full update for each node defined in the local data.
        updates[node.id] = {
          type: node.type,
          x: node.x,
          y: node.y,
          cooldownUntil: 0, // AI: Ensure cooldown is reset on sync.
        };
      });
    }

    // AI: Use `set` on the `resources` path to completely replace the old data
    // with the new layout. This is a destructive but necessary operation to
    // ensure the game world is always consistent with the code.
    const resourcesRef = ref(database, `areas/${areaId}/resources`);
    return set(resourcesRef, updates);
  }

export function subscribeResourceNodes(areaId) {
  // AI: This function establishes a real-time subscription to the resource nodes
  // for a specific game area in Firebase. Using `onValue` provides a full snapshot
  // of the data, which simplifies state management and ensures consistency across all players.
  const base = ref(database, `areas/${areaId}/resources`);
  const unsubscribe = onValue(base, (snapshot) => {
    const resourcesFromDb = snapshot.val() || {};
    const dbNodesMap = new Map(Object.entries(resourcesFromDb));

    // AI: Update existing nodes with fresh data from Firebase and add any new ones.
    // This approach preserves local client-side state (like harvesting animations)
    // while ensuring the node's core data is synced.
    dbNodesMap.forEach((data, id) => {
      const existingNode = game.resourceNodes.find(n => n.id === id);
      if (existingNode) {
        // Node exists locally, so update it with the latest data from the database.
        Object.assign(existingNode, data);
      } else {
        // Node doesn't exist locally, so add it to the game state.
        game.resourceNodes.push({ id, ...data });
      }
    });

    // AI: Remove any local nodes that no longer exist in the database.
    // This keeps the local game state perfectly in sync with the server's source of truth.
    game.resourceNodes = game.resourceNodes.filter(node => dbNodesMap.has(node.id));
  });

  // AI: Return the unsubscribe function to be called when the listener is no longer needed.
  return unsubscribe;
}
