import { gameState } from '../../state/gameState.js';
import { Inventory } from '../inventory/index.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { NotificationManager } from '../../systems/NotificationManager.js';
import { FISH_TABLE } from '../../data/fish.js';

export const Cooking = {
  // Single-cook state (no UI slots)
  currentCooking: null,
  currentCookingTimer: null,
  cookingQueue: [],

  init() {
    console.log('Cooking.init called');
    this.setupCampfireDragDrop();
    this.updateUI();
    this.cookingQueue = [];
  },

  setupCampfireDragDrop() {
    const campfire = document.getElementById('campfire');
    if (!campfire) return;

    // Make campfire accept drag and drop
    campfire.addEventListener('dragover', (e) => { e.preventDefault(); campfire.classList.add('drag-over'); });
    campfire.addEventListener('dragleave', () => { campfire.classList.remove('drag-over'); });

    // Accept any drop onto the campfire (no longer restrict to top half)
    campfire.addEventListener('drop', (e) => {
      e.preventDefault();
      // Stop other drop handlers (ground drop) from processing the same event
      try { e.stopPropagation(); e.stopImmediatePropagation(); } catch {}
      campfire.classList.remove('drag-over');
      console.log('Cooking.drop handler fired ON CAMPFIRE, dataTransfer types:', e.dataTransfer?.types);

      // Try multiple ways to discover inventory index: dataTransfer first, then global Inventory state
      let invIndex = e.dataTransfer.getData('text/x-inv-idx') || e.dataTransfer.getData('application/x-inv-idx');
      if (!invIndex && window?.Inventory && (window.Inventory.dragFromIndex || window.Inventory.dragFromIndex === 0)) {
        invIndex = String(window.Inventory.dragFromIndex);
      }

      if (invIndex) {
        const index = parseInt(invIndex);
        if (gameState.inventory && gameState.inventory[index]) {
          const item = gameState.inventory[index];
          console.log('Cooking: detected inventory drop index', index, 'item', item);
          this.startCookingSingle(item, index);
        return;
        }
      }
      
      // Fallback: check dataTransfer plain payload
      const dragData = e.dataTransfer.getData('text/plain');
      if (dragData) {
        try {
          const itemData = JSON.parse(dragData);
          this.startCookingSingle(itemData);
        } catch (error) {
          console.error('Error parsing drag data:', error);
        }
      }
    });

    // Global drop listener for debugging (non-destructive)
    document.addEventListener('drop', (e) => {
      console.log('GLOBAL drop event at', e.target && e.target.id, 'types:', e.dataTransfer?.types);
    });
  },

  // (multi-slot functionality removed) 

  /* Single-cook flow (no slots) */
  startCookingSingle(itemData, invIndex) {
    // If already cooking, enqueue
    if (this.currentCooking) {
      this.cookingQueue.push({ itemData, invIndex });
      return;
    }

    const fish = FISH_TABLE.find(f => f.name === (itemData?.name || ''));
    if (!fish) {
      NotificationManager.warning('Cannot Cook', 'You can only cook fish over the campfire.');
      return;
    }

    // If cooking an inventory slot, attach cooking metadata to that slot and keep the item
    const cookTarget = (typeof invIndex === 'number' && !Number.isNaN(invIndex) && gameState.inventory[invIndex]) ? { type: 'inventory', index: invIndex } : { type: 'campfire' };

    console.log('Cooking.startCookingSingle -> starting cook for', fish.name, 'target:', cookTarget);
    this.currentCooking = { fish, startTime: Date.now(), cookTime: this.getCookingTime(fish), target: cookTarget, elapsed: 0, paused: false };

    // Mark inventory slot as cooking if applicable
    if (cookTarget.type === 'inventory') {
      const idx = cookTarget.index;
      const slot = gameState.inventory[idx];
      if (slot) {
        // If stack > 1, decrement one from the stack so we're cooking one unit
        if (slot.count && slot.count > 1) {
          slot.count = Math.max(0, slot.count - 1);
        }
        // Attach cooking metadata to this slot so overlay persists across renders
        slot.cooking = { startTime: this.currentCooking.startTime, cookTime: this.currentCooking.cookTime };
        try { Inventory.debouncedRender(); } catch {}
      }
      // Attach overlay to inventory item element (retry until render completes)
      this.attachOverlayToInventorySlot(idx);
    } else {
      this.showCampfireOverlay();
    }

    this.updateCampfireAnimation();
    this.startCookingTimerSingle();

    AudioManager.playButtonClick();
    NotificationManager.success('Cooking Started', `${fish.name} is now cooking over the fire.`);
  },

  // Local helper to remove an item by name from gameState.inventory
  _removeItemFromInventory(name, amount = 1) {
    try {
      for (let i = 0; i < gameState.inventory.length; i++) {
        const slot = gameState.inventory[i];
        if (!slot) continue;
        if (slot.name === name) {
          const slotCount = slot.count || 1;
          if (slotCount <= amount) {
            gameState.inventory[i] = null;
          } else {
            gameState.inventory[i].count = slotCount - amount;
          }
          try { Inventory.debouncedRender(); } catch {}
          try { SaveManager.debouncedSave(); } catch {}
          return true;
        }
      }
    } catch (err) {
      console.error('Cooking._removeItemFromInventory error', err);
    }
    return false;
  },

  startCookingTimerSingle() {
    if (!this.currentCooking) return;

    const update = () => {
      if (!this.currentCooking) return;
      // If cooking target is inventory, pause if item is not currently over campfire
      if (this.currentCooking.target && this.currentCooking.target.type === 'inventory') {
        const idx = this.currentCooking.target.index;
        const itemEl = document.querySelector(`.item[data-index=\"${idx}\"]`);
        if (!itemEl) {
          // pause until item reappears
          this.currentCooking.paused = true;
          this.currentCooking.pauseTime = Date.now();
          this.currentCookingTimer = setTimeout(update, 500);
      return;
        }
        // If item exists, ensure it's in campfire area to continue; if not, pause
        const campfire = document.getElementById('campfire');
        if (campfire) {
          const campRect = campfire.getBoundingClientRect();
          const itemRect = itemEl.getBoundingClientRect();
          // Consider overlapping threshold: center point of item inside campfire bounds
          const cx = itemRect.left + itemRect.width / 2;
          const cy = itemRect.top + itemRect.height / 2;
          const inside = cx >= campRect.left && cx <= campRect.right && cy >= campRect.top && cy <= campRect.bottom;
          if (!inside) {
            // pause
            if (!this.currentCooking.paused) {
              this.currentCooking.paused = true;
              this.currentCooking.pauseTime = Date.now();
            }
            this.currentCookingTimer = setTimeout(update, 500);
            return;
          } else {
            // resuming from pause: adjust startTime by paused duration
            if (this.currentCooking.paused && this.currentCooking.pauseTime) {
              const pausedFor = Date.now() - this.currentCooking.pauseTime;
              this.currentCooking.startTime += pausedFor;
              this.currentCooking.paused = false;
              delete this.currentCooking.pauseTime;
            }
          }
        }
      }

      const elapsed = Date.now() - this.currentCooking.startTime;
      const progress = Math.min(elapsed / this.currentCooking.cookTime, 1);
      const remaining = Math.max(0, this.currentCooking.cookTime - elapsed);
      this.updateCampfireOverlayUI(progress, remaining);
      if (progress >= 1) {
        this.completeCookingSingle();
      } else {
        this.currentCookingTimer = setTimeout(update, 100);
      }
    };
    update();
  },

  completeCookingSingle() {
    if (!this.currentCooking) return;
    const fish = this.currentCooking.fish;
    const cookedFishName = `Cooked ${fish.name}`;
    const xpGained = (fish.xp || 0) * 2;

    // If cooking targeted an inventory slot, replace the item there with cooked version
    if (this.currentCooking.target && this.currentCooking.target.type === 'inventory') {
      const idx = this.currentCooking.target.index;
      if (gameState.inventory[idx]) {
        gameState.inventory[idx].name = cookedFishName;
        // remove cooking metadata
        delete gameState.inventory[idx].cooking;
        try { this.detachOverlayFromInventorySlot(idx); } catch {}
        try { Inventory.debouncedRender(); } catch {}
      } else {
        // Fallback: add to inventory
        Inventory.addItem(cookedFishName);
      }
    } else {
      // Campfire target -> add to inventory
      Inventory.addItem(cookedFishName);
    }

    this.gainCookingXP(xpGained);
    this.playCookingCompleteSound();
    // NO notification as requested

    this.currentCooking = null;
    if (this.currentCookingTimer) { clearTimeout(this.currentCookingTimer); this.currentCookingTimer = null; }
    this.hideCampfireOverlay();
    this.updateCampfireAnimation();
    SaveManager.debouncedSave();

    // If there are queued cook requests, start the next one
    if (this.cookingQueue && this.cookingQueue.length > 0) {
      const next = this.cookingQueue.shift();
      // Kick off next cooking item
      this.startCookingSingle(next.itemData, next.invIndex);
    }
  },

  cancelCookingSingle() {
    if (!this.currentCooking) return;
    // Remove cooking metadata from any inventory slot that has it
    for (let i = 0; i < gameState.inventory.length; i++) {
      const slot = gameState.inventory[i];
      if (slot && slot.cooking) {
        delete slot.cooking;
        try { this.detachOverlayFromInventorySlot(i); } catch {}
      }
    }
    if (this.currentCookingTimer) { clearTimeout(this.currentCookingTimer); this.currentCookingTimer = null; }
    this.currentCooking = null;
    this.hideCampfireOverlay();
    this.updateCampfireAnimation();
    SaveManager.debouncedSave();
  },

  showCampfireOverlay() {
    const campfire = document.getElementById('campfire');
    if (!campfire) return;
    let overlay = campfire.querySelector('.campfire-cooking-overlay');
    const iconId = this.currentCooking?.fish?.icon || '';
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'campfire-cooking-overlay';
      overlay.innerHTML = `
        <div class="cooking-item-icon"><svg><use href="#${iconId}" xlink:href="#${iconId}"/></svg></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill"></div></div>
        <span class="progress-text">0s</span>
      `;
      campfire.appendChild(overlay);
    } else {
      // Update icon if overlay already exists
      const iconEl = overlay.querySelector('.cooking-item-icon svg use');
      if (iconEl) {
        iconEl.setAttribute('href', `#${iconId}`);
        iconEl.setAttribute('xlink:href', `#${iconId}`);
      }
    }
    // Ensure visible and on top
    overlay.style.position = 'absolute';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '60';
    overlay.style.pointerEvents = 'none';
  },

  updateCampfireOverlayUI(progress, timeRemaining) {
    const campfire = document.getElementById('campfire');
    if (!campfire) return;
    // If target is inventory, update overlay on the item element (per-item overlay should be visible over the item)
    if (this.currentCooking && this.currentCooking.target && this.currentCooking.target.type === 'inventory') {
      const idx = this.currentCooking.target.index;
      const itemEl = document.querySelector(`.item[data-index="${idx}"]`);
      if (itemEl) {
        let overlay = itemEl.querySelector('.item-cooking-overlay');
        if (!overlay) {
          // attach one if missing
          overlay = document.createElement('div');
          overlay.className = 'item-cooking-overlay';
          overlay.innerHTML = '<div class="progress-bar-bg"><div class="progress-bar-fill"></div></div><span class="progress-text">0s</span>';
          itemEl.appendChild(overlay);
        }
        const fill = overlay.querySelector('.progress-bar-fill');
        const text = overlay.querySelector('.progress-text');
        if (fill) fill.style.width = `${Math.floor(progress * 100)}%`;
        if (text) text.textContent = `${Math.ceil(timeRemaining / 1000)}s`;
        return;
      }
      // If itemEl not found, fall through to campfire overlay
    }
    const overlay = campfire.querySelector('.campfire-cooking-overlay');
    if (!overlay) return;
    const fill = overlay.querySelector('.progress-bar-fill');
    const text = overlay.querySelector('.progress-text');
    if (fill) fill.style.width = `${Math.floor(progress * 100)}%`;
    if (text) text.textContent = `${Math.ceil(timeRemaining / 1000)}s`;
  },

  attachOverlayToInventorySlot(index) {
    // Try to attach overlay to the item element. Retry a few times if render hasn't finished.
    let attempts = 0;
    const tryAttach = () => {
      attempts++;
      const itemEl = document.querySelector(`.item[data-index=\"${index}\"]`);
      if (!itemEl) {
        if (attempts < 10) return setTimeout(tryAttach, 60);
        return; // give up
      }
      // ensure container positioned so absolute overlay can anchor
      try { if (!itemEl.style.position) itemEl.style.position = 'relative'; } catch {}
      let overlay = itemEl.querySelector('.item-cooking-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'item-cooking-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '-8px';
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
        overlay.style.zIndex = '10';
        overlay.innerHTML = '<div class="progress-bar-bg"><div class="progress-bar-fill"></div></div><span class="progress-text">0s</span>';
        itemEl.appendChild(overlay);
      }
      // initialize progress from slot metadata if available
      try {
        const meta = gameState.inventory[index]?.cooking;
        if (meta) {
          const elapsed = Date.now() - (meta.startTime || Date.now());
          const progress = Math.max(0, Math.min(1, elapsed / (meta.cookTime || 1)));
          const fill = overlay.querySelector('.progress-bar-fill');
          const text = overlay.querySelector('.progress-text');
          if (fill) fill.style.width = `${Math.floor(progress * 100)}%`;
          if (text) text.textContent = `${Math.ceil(Math.max(0, (meta.cookTime || 0) - elapsed) / 1000)}s`;
        }
      } catch {}
    };
    tryAttach();
  },

  detachOverlayFromInventorySlot(index) {
    const itemEl = document.querySelector(`.item[data-index=\"${index}\"]`);
    if (!itemEl) return;
    const overlay = itemEl.querySelector('.item-cooking-overlay');
    if (overlay) overlay.remove();
  },

  hideCampfireOverlay() {
    const campfire = document.getElementById('campfire');
    if (!campfire) return;
    const overlay = campfire.querySelector('.campfire-cooking-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  // (multi-slot helper removed)

  getCookingTime(fish) {
    // Base cooking time varies by fish rarity
    const baseTimes = {
      'Minnow': 15000,      // 15 seconds
      'Trout': 20000,       // 20 seconds
      'Bass': 25000,        // 25 seconds
      'Salmon': 30000,      // 30 seconds
      'Golden Carp': 35000  // 35 seconds
    };
    return baseTimes[fish.name] || 20000;
  },

  startCookingTimer(slotIndex) {
    // multi-slot timer removed; single-cook uses startCookingTimerSingle
  },

  updateTimerUI(slotIndex, progress, timeRemaining) {
    // removed multi-slot UI update
  },

  completeCooking(slotIndex) {
    // removed multi-slot completion
  },

  removeCookingItem(slotIndex) {
    // removed multi-slot removal
  },

  updateCookingSlot(slotIndex) {
    // removed multi-slot DOM updates
  },

  gainCookingXP(amount) {
    if (!gameState.cooking) {
      gameState.cooking = {
        level: 1,
        xp: 0,
        xpToNext: 100
      };
    }

    gameState.cooking.xp += amount;
    
    // Check for level up
    while (gameState.cooking.xp >= gameState.cooking.xpToNext) {
      gameState.cooking.xp -= gameState.cooking.xpToNext;
      const oldLevel = gameState.cooking.level;
      gameState.cooking.level++;
      gameState.cooking.xpToNext = Math.floor(gameState.cooking.xpToNext * 1.2);
      
      NotificationManager.success('Level Up!', `Cooking level ${oldLevel} → ${gameState.cooking.level}`);
    }
    
    this.updateUI();
  },

  updateCampfireAnimation() {
    const campfire = document.getElementById('campfire');
    if (!campfire) return;

    const isCooking = !!this.currentCooking;
    campfire.classList.toggle('cooking', isCooking);
  },

  updateUI() {
    if (!gameState.cooking) {
      gameState.cooking = {
        level: 1,
        xp: 0,
        xpToNext: 100
      };
    }

    // Update cooking skill display
    const levelEl = document.getElementById('cooking-level');
    const xpEl = document.getElementById('cooking-xp');
    const xpNeededEl = document.getElementById('cooking-xp-needed');
    const xpBarEl = document.getElementById('cooking-xp-bar');

    if (levelEl) levelEl.textContent = gameState.cooking.level;
    if (xpEl) xpEl.textContent = gameState.cooking.xp;
    if (xpNeededEl) xpNeededEl.textContent = gameState.cooking.xpToNext;
    if (xpBarEl) {
      const progress = (gameState.cooking.xp / gameState.cooking.xpToNext) * 100;
      xpBarEl.style.width = `${progress}%`;
    }

    // Update campfire animation
    this.updateCampfireAnimation();
  },

  playCookingCompleteSound() {
    // Create a pleasant beep sound for cooking completion
    if (typeof AudioManager.playGoldPickup === 'function') {
      // Play the gold pickup sound as a fallback
      AudioManager.playGoldPickup();
    }
    
    // Try to create a custom beep sound using Web Audio API
    try {
      const audioContext = AudioManager.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      
      // Create a pleasant two-tone beep
      const createBeep = (frequency, duration, delay = 0) => {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0, audioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);
        }, delay);
      };
      
      // Two ascending beeps for cooking completion
      createBeep(800, 0.15, 0);    // First beep
      createBeep(1000, 0.2, 120);  // Second beep (higher pitch)
      
    } catch (error) {
      console.log('Custom beep sound failed, using fallback');
    }
  }
};