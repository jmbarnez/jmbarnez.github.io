import { clamp } from '../../core/dom.js';
import { gameState } from '../../state/gameState.js';
import { Inventory } from '../inventory/index.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { FISH_TABLE } from '../../data/fish.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { debounce, batchDomUpdates, perfMonitor } from '../../utils/performance.js';

export const Fishing = {
  fishTypes: FISH_TABLE,

  init() {
    // Bind debounced method to this context
    this.debouncedUpdateUI = debounce(() => this.updateUI(), 16);
  },

  start() {
    if (gameState.isFishing) return;
    gameState.isFishing = true;
    const fishBtn = document.getElementById('fishBtn');
    if (fishBtn) { fishBtn.disabled = true; fishBtn.setAttribute('aria-busy','true'); }
    const status = document.getElementById('status'); if (status) status.textContent = 'Casting line...';
    const waitTime = 1800 + Math.random() * 2200; // faster cadence for better feel
    setTimeout(() => { const fish = this.catchFish(); this.completeFishing(fish); }, waitTime);
    AudioManager.playClick();
  },

  catchFish() {
    const totalWeight = this.fishTypes.reduce((sum, fish) => sum + fish.weight, 0);
    let random = Math.random() * totalWeight;
    for (const fish of this.fishTypes) { random -= fish.weight; if (random <= 0) return fish; }
    return this.fishTypes[0];
  },

  completeFishing(fish) {
    gameState.isFishing = false;
    const fishBtn = document.getElementById('fishBtn');
    if (fishBtn) { fishBtn.disabled = false; fishBtn.removeAttribute('aria-busy'); }
    Inventory.addItem(fish.name);
    this.gainXP(fish.xp);
    const status = document.getElementById('status'); if (status) status.textContent = `Caught a ${fish.name}! (+${fish.xp} XP)`;
    gameState.stats.stamina = clamp(gameState.stats.stamina - 5, 0, gameState.stats.staminaMax);
    gameState.stats.mana = clamp(gameState.stats.mana - 2, 0, gameState.stats.manaMax);
    const staminaBar = document.getElementById('stamina-bar'); if (staminaBar) staminaBar.style.width = `${(gameState.stats.stamina / gameState.stats.staminaMax) * 100}%`;
    const manaBar = document.getElementById('mana-bar'); if (manaBar) manaBar.style.width = `${(gameState.stats.mana / gameState.stats.manaMax) * 100}%`;
    SaveManager.debouncedSave(); // Auto-save after fishing completion
  },

  gainXP(amount) {
    perfMonitor.time('fishing-xp-update');
    
    gameState.fishing.xp += amount;
    while (gameState.fishing.xp >= gameState.fishing.xpToNext) {
      gameState.fishing.xp -= gameState.fishing.xpToNext;
      gameState.fishing.level++;
      gameState.fishing.xpToNext = Math.floor(gameState.fishing.xpToNext * 1.2);
    }
    
    this.debouncedUpdateUI();
    perfMonitor.timeEnd('fishing-xp-update');
  },

  updateUI() {
    batchDomUpdates([
      () => {
        // Update fishing stats UI numbers
        try {
          const lvlEl = document.getElementById('fishing-level-display');
          if (lvlEl) lvlEl.textContent = String(gameState.fishing.level);
          const xpEl = document.getElementById('exp-display');
          if (xpEl) xpEl.textContent = String(gameState.fishing.xp);
          const needEl = document.getElementById('exp-needed-display');
          if (needEl) needEl.textContent = String(gameState.fishing.xpToNext);
        } catch {}
      },
      () => {
        const fishingLevelBadge = document.querySelector('[data-skill-level="fishing"]');
        if (fishingLevelBadge) fishingLevelBadge.textContent = gameState.fishing.level;
        
        const fishingCard = document.querySelector('.skill-card[data-skill="fishing"]');
        if (fishingCard) {
          const fishingPct = Math.min(100, (gameState.fishing.xp / gameState.fishing.xpToNext) * 100);
          fishingCard.style.setProperty('--progress-pct', `${fishingPct}%`);
          
          // Ensure icon stays as animated fish regardless of catches
          try {
            const iconWrap = fishingCard.querySelector('.skill-icon-large svg');
            if (iconWrap) {
              iconWrap.classList.add('fish-animated');
              const useEl = iconWrap.querySelector('use') || document.createElementNS('http://www.w3.org/2000/svg', 'use');
              if (!useEl.parentNode) iconWrap.appendChild(useEl);
              useEl.setAttribute('href', '#fish-koi');
            }
          } catch {}
        }
      }
    ]);
  }
};


