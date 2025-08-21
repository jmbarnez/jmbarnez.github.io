export const gameState = {
  playerInventory: Array(24).fill(null),
  isExploring: false,
  groundItems: [], // This might be better managed by groundItems.js, but we can start here.
  user: null, // To store user data
  isInventoryUpdating: false, // Flag to prevent race conditions during inventory updates
  gold: 0, // Player's gold currency
};
