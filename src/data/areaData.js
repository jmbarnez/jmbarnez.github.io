// AI: This file centralizes the definitions for game areas, including resource node layouts.
// By defining node positions here, we can easily create and manage different maps
// with unique resource distributions. This approach is scalable for when new maps are added.

export const areaData = {
  beach: {
    resourceNodes: [
      // AI: Stone deposits - main mining nodes for rare materials
      { id: 'stone_deposit_1', type: 'stone_deposit', x: 150, y: 180, cooldownUntil: 0 },
      { id: 'stone_deposit_2', type: 'stone_deposit', x: 450, y: 200, cooldownUntil: 0 },
      { id: 'stone_deposit_3', type: 'stone_deposit', x: 320, y: 100, cooldownUntil: 0 }, // Moved away from oasis
      
      // AI: Sandstones - positioned around stone deposits for efficient mining routes
      { id: 'sandstone_1', type: 'sandstone', x: 120, y: 160, cooldownUntil: 0 }, // Near stone_deposit_1
      { id: 'sandstone_2', type: 'sandstone', x: 170, y: 200, cooldownUntil: 0 }, // Near stone_deposit_1
      { id: 'sandstone_3', type: 'sandstone', x: 420, y: 180, cooldownUntil: 0 }, // Near stone_deposit_2
      { id: 'sandstone_4', type: 'sandstone', x: 470, y: 220, cooldownUntil: 0 }, // Near stone_deposit_2
      { id: 'sandstone_5', type: 'sandstone', x: 290, y: 80, cooldownUntil: 0 }, // Near stone_deposit_3
      { id: 'sandstone_6', type: 'sandstone', x: 350, y: 120, cooldownUntil: 0 }, // Near stone_deposit_3
    ],
  },
  // AI: Future maps can be added here, for example:
  // forest: {
  //   resourceNodes: [
  //     { id: 'forest_wood_1', type: 'wood', x: 200, y: 200 },
  //     ...
  //   ],
  // },
};
