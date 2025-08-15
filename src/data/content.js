// Centralized content definitions for discoveries and items

export const MAX_DISCOVERY_CARDS = 3;

// Item metadata: icon, stack limits, value, and simple categorization
export const ItemCatalog = {
  'Sea Shell': { icon: 'icon-shell', stack: 99, value: 1, category: 'loot' },
  Driftwood: { icon: 'icon-driftwood', stack: 99, value: 1, category: 'material' },
  Seaweed: { icon: 'icon-seaweed', stack: 99, value: 1, category: 'food' },
  'Small Coin': { icon: 'icon-coin', stack: 9999, value: 1, category: 'currency' },
  'Fishing Pole': { icon: 'icon-hook', stack: 1, value: 10, category: 'tool' },
};

// Discovery pools keyed by location key
export const DiscoveryPools = {
  beach: [
    { name: 'Sea Shell', category: 'ground', rarity: 40, xp: 3, icon: 'icon-shell', description: 'A common seashell washed ashore' },
    { name: 'Driftwood', category: 'ground', rarity: 35, xp: 3, icon: 'icon-driftwood', description: 'A piece of smoothed driftwood' },
    { name: 'Seaweed', category: 'ground', rarity: 30, xp: 2, icon: 'icon-seaweed', description: 'Fresh seaweed tangled in the tide' },
    { name: 'Small Coin', category: 'ground', rarity: 14, xp: 3, icon: 'icon-coin', description: 'A weathered coin glinting in the sand' },
    // Treasure chest (rare)
    { name: 'Treasure Chest', category: 'treasure', rarity: 3, xp: 12, icon: 'icon-treasure-chest', description: 'A chest half-buried in sand' },
    
    // Location discovery (unlocks after level 5+; appears rarely once eligible)
    { name: 'Whispering Woods', category: 'location', unlockLocationKey: 'forest', minLevel: 5, rarity: 2, xp: 10, icon: 'icon-location', description: 'You sense a path into the woods...' },
  ],
};


