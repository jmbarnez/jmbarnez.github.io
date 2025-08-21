// src/data/enemies.js
// Loader and helpers for enemy templates defined in JSON.
// This module centralizes template lookups and weighted selection.

import raw from './enemies.json';

const templates = raw.templates || [];
const templatesById = Object.fromEntries(templates.map(t => [t.id, t]));

/**
 * Get a template by its id.
 * @param {string} id
 */
export function getTemplateById(id) {
  return templatesById[id];
}

/**
 * Get templates that are valid for a specific area.
 * If a template has an `areas` array, it must include the areaId.
 * Templates without `areas` are considered global.
 * @param {string} areaId
 */
export function getTemplatesForArea(areaId) {
  return templates.filter(t => {
    if (!t.areas || t.areas.length === 0) return true;
    return t.areas.includes(areaId);
  });
}

/**
 * Choose a template using spawnWeight. Accepts an optional RNG for testing.
 * @param {Array<Object>} templatesArr
 * @param {Function} rng
 */
export function chooseWeightedTemplate(templatesArr, rng = Math.random) {
  if (!templatesArr || templatesArr.length === 0) return null;
  const weights = templatesArr.map(t => (t.spawnWeight || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return templatesArr[0];
  let r = rng() * total;
  for (let i = 0; i < templatesArr.length; i++) {
    r -= weights[i];
    if (r <= 0) return templatesArr[i];
  }
  return templatesArr[templatesArr.length - 1];
}

export default {
  getTemplateById,
  getTemplatesForArea,
  chooseWeightedTemplate,
  templatesById,
  templates
};


