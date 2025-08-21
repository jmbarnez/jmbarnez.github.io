// AI: Color Utility for generating unique player colors.

/**
 * A predefined list of visually distinct colors for players.
 */
const playerColors = [
  '#ff6b6b', '#f06595', '#cc5de8', '#845ef7', '#5c7cfa', '#339af0',
  '#22b8cf', '#20c997', '#51cf66', '#94d82d', '#fcc419', '#ff922b',
  '#ff6b6b', '#f06595', '#cc5de8', '#845ef7', '#5c7cfa', '#339af0',
  '#22b8cf', '#20c997', '#51cf66', '#94d82d', '#fcc419', '#ff922b'
];

/**
 * Generates a unique color for a player based on their UID.
 * This uses a simple hashing algorithm to ensure the same UID always gets the same color.
 * @param {string} uid - The player's unique ID.
 * @returns {string} A hex color code.
 */
export function getColorFromUID(uid) {
  if (!uid) {
    return playerColors; // Default color
  }

  // Simple hash function to get an index from the UID string.
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    const char = uid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % playerColors.length;
  return playerColors[index];
}