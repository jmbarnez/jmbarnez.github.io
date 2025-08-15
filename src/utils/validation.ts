import { logger } from './logger.js';

/**
 * Validation utilities for game data
 */

// Item validation
export function validateItem(item: any): item is { name: string; type?: string; count?: number } {
  if (!item || typeof item !== 'object') {
    logger.warn('Item validation failed: not an object', item);
    return false;
  }
  
  if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
    logger.warn('Item validation failed: invalid name', item);
    return false;
  }
  
  if (item.name === 'Unknown' || item.name === 'undefined' || item.name === 'null') {
    logger.warn('Item validation failed: placeholder name', item);
    return false;
  }
  
  if (item.count !== undefined && (typeof item.count !== 'number' || item.count < 1 || !Number.isInteger(item.count))) {
    logger.warn('Item validation failed: invalid count', item);
    return false;
  }
  
  if (item.type !== undefined && item.type !== null && typeof item.type !== 'string') {
    logger.warn('Item validation failed: invalid type', item);
    return false;
  }
  
  return true;
}

// Inventory validation
export function validateInventorySlot(slot: any, index: number): boolean {
  if (slot === null || slot === undefined) {
    return true; // Empty slots are valid
  }
  
  if (!validateItem(slot)) {
    logger.error(`Invalid item in inventory slot ${index}:`, slot);
    return false;
  }
  
  return true;
}

// Equipment validation
export function validateEquipmentSlot(item: any, slotType: string): boolean {
  if (item === null || item === undefined) {
    return true; // Empty equipment slots are valid
  }
  
  if (!validateItem(item)) {
    logger.error(`Invalid item in equipment slot ${slotType}:`, item);
    return false;
  }
  
  // Validate that item type matches slot (if type is specified)
  const expectedTypes: Record<string, string[]> = {
    helmet: ['helmet', 'hat'],
    chest: ['chest', 'chestplate', 'armor'],
    gloves: ['gloves', 'gauntlets'],
    pants: ['pants', 'leggings'],
    shoes: ['shoes', 'boots'],
    ring1: ['ring'],
    ring2: ['ring'],
    amulet: ['amulet', 'necklace']
  };
  
  if (item.type && expectedTypes[slotType] && !expectedTypes[slotType].includes(item.type)) {
    logger.warn(`Item type ${item.type} doesn't match equipment slot ${slotType}`, item);
    // Don't return false here - just warn, as this might be intentional
  }
  
  return true;
}

// Skill validation
export function validateSkill(skill: any, skillName: string): boolean {
  if (!skill || typeof skill !== 'object') {
    logger.error(`Invalid skill object for ${skillName}:`, skill);
    return false;
  }
  
  const requiredFields = ['level', 'xp', 'xpToNext'];
  for (const field of requiredFields) {
    if (typeof skill[field] !== 'number' || skill[field] < 0 || !Number.isInteger(skill[field])) {
      logger.error(`Invalid ${field} in skill ${skillName}:`, skill[field]);
      return false;
    }
  }
  
  if (skill.level < 1 || skill.level > 99) {
    logger.error(`Invalid level for skill ${skillName}: ${skill.level}`);
    return false;
  }
  
  if (skill.xp >= skill.xpToNext && skill.level < 99) {
    logger.warn(`Skill ${skillName} has enough XP to level up: ${skill.xp}/${skill.xpToNext}`);
  }
  
  return true;
}

// Stats validation
export function validateStats(stats: any): boolean {
  if (!stats || typeof stats !== 'object') {
    logger.error('Invalid stats object:', stats);
    return false;
  }
  
  const requiredStats = ['hp', 'hpMax', 'stamina', 'staminaMax', 'mana', 'manaMax'];
  for (const stat of requiredStats) {
    if (typeof stats[stat] !== 'number' || stats[stat] < 0) {
      logger.error(`Invalid stat ${stat}:`, stats[stat]);
      return false;
    }
  }
  
  // Current stats shouldn't exceed max stats
  if (stats.hp > stats.hpMax) {
    logger.warn(`HP (${stats.hp}) exceeds max HP (${stats.hpMax})`);
    stats.hp = stats.hpMax; // Auto-fix
  }
  
  if (stats.stamina > stats.staminaMax) {
    logger.warn(`Stamina (${stats.stamina}) exceeds max stamina (${stats.staminaMax})`);
    stats.stamina = stats.staminaMax; // Auto-fix
  }
  
  if (stats.mana > stats.manaMax) {
    logger.warn(`Mana (${stats.mana}) exceeds max mana (${stats.manaMax})`);
    stats.mana = stats.manaMax; // Auto-fix
  }
  
  return true;
}

// General purpose data sanitization
export function sanitizeString(input: any): string {
  if (typeof input !== 'string') {
    return String(input || '');
  }
  
  return input.trim().replace(/[<>"/]/g, ''); // Remove potentially dangerous characters
}

export function sanitizeNumber(input: any, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = Number(input);
  if (Number.isNaN(num)) {
    logger.warn('Failed to sanitize number:', input);
    return min;
  }
  
  return Math.max(min, Math.min(max, Math.floor(num)));
}

// API response validation
export function validateApiResponse(response: any, expectedFields: string[] = []): boolean {
  if (!response || typeof response !== 'object') {
    logger.error('Invalid API response: not an object');
    return false;
  }
  
  for (const field of expectedFields) {
    if (!(field in response)) {
      logger.error(`Missing required field in API response: ${field}`);
      return false;
    }
  }
  
  return true;
}

// Safe JSON parsing
export function safeJsonParse(jsonString: string, fallback: any = null): any {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed;
  } catch (error) {
    logger.error('Failed to parse JSON:', error);
    return fallback;
  }
}

// Safe property access
export function safeGet<T>(obj: any, path: string, fallback: T): T {
  try {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return fallback;
      }
      current = current[key];
    }
    
    return current;
  } catch (error) {
    logger.warn(`Safe get failed for path ${path}:`, error);
    return fallback;
  }
}
