import items from './items.json';
import equipment from './equipment.json';
import locations from './locations.json';

export const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
export const equipmentById = Object.fromEntries(equipment.map(e => [e.id, e]));
export const locationsById = Object.fromEntries(locations.map(l => [l.id, l]));

export function getSpawnWeights(locationId = 'beach') {
  const loc = locationsById[locationId];
  if (loc && loc.spawnRates) return { ...loc.spawnRates };
  // fallback: use item weights
  const weights = {};
  items.forEach(i => { if (i.spawnable) weights[i.id] = i.weight ?? 1; });
  return weights;
}

export function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([_, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[entries.length - 1]?.[0] ?? null;
}

export function randomSpawnItem(locationId = 'beach') {
  const weights = getSpawnWeights(locationId);
  const id = pickWeighted(weights);
  return id ? itemsById[id] : null;
}

export { items, equipment, locations };

