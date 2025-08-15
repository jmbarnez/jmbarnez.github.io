// Declarative zones configuration by location
// Each zone can map to a system (e.g., fishing) and declare requirements

export const ZONES_BY_LOCATION = {
  beach: [
    {
      id: 'beach-fishing',
      name: 'Passive coastal fishing',
      system: 'fishing',
      actionLabel: 'Fish',
      toolRequired: { name: 'Fishing Pole' },
      themeClass: 'theme-beach',
      icon: 'icon-fish-spot'
    },
    {
      id: 'beach-mining-1',
      name: 'Level 1 Mining Area',
      system: 'mining',
      actionLabel: 'Mine',
      toolRequired: { name: 'Pickaxe' },
      themeClass: 'theme-mining',
      icon: 'icon-location',
      disabled: true // placeholder
    }
  ],
  forest: []
};


