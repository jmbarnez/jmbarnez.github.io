// Core game type definitions
export interface Stats {
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  mana: number;
  manaMax: number;
}

export interface Skill {
  level: number;
  xp: number;
  xpToNext: number;
}

export interface CombatSkills {
  attack: Skill;
  strength: Skill;
  defense: Skill;
}

export interface InventoryItem {
  name: string;
  count: number;
  type?: string;
  id?: string;
  icon?: string;
}

export interface Equipment {
  helmet: InventoryItem | null;
  chest: InventoryItem | null;
  gloves: InventoryItem | null;
  pants: InventoryItem | null;
  shoes: InventoryItem | null;
  ring1: InventoryItem | null;
  ring2: InventoryItem | null;
  amulet: InventoryItem | null;
}

export interface Location {
  key: string;
  name: string;
  icon: string;
  badgeClass?: string;
  bgClass?: string;
}

export interface Discovery {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  timestamp: string;
}

export interface GameState {
  stats: Stats;
  fishing: Skill;
  exploration: Skill;
  combat: CombatSkills;
  foraging: Skill;
  inventory: InventoryItem[];
  equipment: Equipment;
  invCapacity: number;
  coins: number;
  isFishing: boolean;
  isExploring: boolean;
  discoveredFishingSpot: boolean;
  activeView: string;
  discoveries: Discovery[];
  _savedAt?: string;
}

export interface Settings {
  highDiscoveryTest: boolean;
}

export interface LocationsData {
  current: Location;
  all: Record<string, Location>;
}

// API Response types
export interface CompleteSaveData {
  gameState: GameState;
  gameTheme?: string;
  fishDiscovered?: string[];
  panelPositions?: Record<string, any>;
  zonePositions?: Record<string, any>;
  groundItems?: any[];
  idleState?: any;
  _savedAt?: string;
}

export interface SaveResponse {
  save?: CompleteSaveData;
  message?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
