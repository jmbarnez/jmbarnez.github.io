import { database } from './firebaseClient.js';
import { ref, onChildAdded, onChildChanged, onChildRemoved, runTransaction, set, get, serverTimestamp } from 'firebase/database';

function nodesRef(areaId) {
  return ref(database, `areas/${areaId}/nodes`);
}

export function subscribeResourceNodes(areaId, onEvent) {
  const base = nodesRef(areaId);
  const a = onChildAdded(base, (snap) => {
    const id = snap.key;
    onEvent && onEvent({ type: 'added', id, data: snap.val() || {} });
  });
  const c = onChildChanged(base, (snap) => {
    const id = snap.key;
    onEvent && onEvent({ type: 'changed', id, data: snap.val() || {} });
  });
  const r = onChildRemoved(base, (snap) => {
    const id = snap.key;
    onEvent && onEvent({ type: 'removed', id });
  });
  return () => { try { a(); } catch(_){} try { c(); } catch(_){} try { r(); } catch(_){} };
}

export async function ensureAreaSeeded(areaId, generator) {
  // If nodes already exist, do nothing
  const existing = await get(nodesRef(areaId));
  if (existing.exists()) return;

  // Single-writer guard on meta/seeded using a transaction
  const metaRef = ref(database, `areas/${areaId}/meta/seeded`);
  const gate = await runTransaction(metaRef, (current) => {
    // Mark as seeded once with a boolean flag
    // (avoid using serverTimestamp sentinel inside transaction value)
    if (current) return current; // already seeded by someone else
    return true;
  });
  if (!gate.committed) return;

  // Double-check nodes still empty to avoid races
  const check = await get(nodesRef(areaId));
  if (check.exists()) return;

  const list = (typeof generator === 'function') ? generator() : [];
  for (const n of list) {
    if (!n || !n.id) continue;
    await set(ref(database, `areas/${areaId}/nodes/${n.id}`), {
      type: n.type,
      x: n.x,
      y: n.y,
      cooldownUntil: 0,
      lastHarvested: 0,
      lastHarvestedBy: null,
      createdAt: serverTimestamp(),
    });
  }
}

export async function harvestNode(areaId, nodeId, uid, cooldownMs = 2500) {
  const nodeRef = ref(database, `areas/${areaId}/nodes/${nodeId}`);
  const now = Date.now();
  const res = await runTransaction(nodeRef, (node) => {
    if (!node) return node;
    if (node.cooldownUntil && now < node.cooldownUntil) {
      return node; // still cooling down; no change => not committed
    }
    return {
      ...node,
      cooldownUntil: now + cooldownMs,
      lastHarvested: now,
      lastHarvestedBy: uid,
    };
  });
  return res.committed;
}
