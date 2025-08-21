// Centralized per-resource configuration.
// - cyclesNeeded: how many harvest cycles are required to produce an item
// - cycleMs: duration (ms) of a single visual/interaction cycle
// Keep this config here so both rendering and transaction logic share the same canonical values.
export const resourceConfigs = {
  // Stone deposits require 2 cycles and have a slightly longer cycle time
  stone_deposit: { cyclesNeeded: 2, cycleMs: 1700 },
  // Sandstone / simple nodes: single-cycle
  sandstone: { cyclesNeeded: 1, cycleMs: 1700 },
  // Default fallback
  default: { cyclesNeeded: 1, cycleMs: 1700 }
};
