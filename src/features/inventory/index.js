import { $, $$ } from '../../core/dom.js';
import { gameState } from '../../state/gameState.js';
import { ItemCatalog } from '../../data/content.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { Equipment } from '../equipment/index.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { debounce, batchDomUpdates, perfMonitor } from '../../utils/performance.js';
import { ErrorHandler, wrapSafe } from '../../utils/errorHandler.js';

export const Inventory = {
  slots: 24,
  dragFromIndex: null,
  dragFromEquipment: null,

  init() {
    ErrorHandler.wrap(() => {
      this.setupDragAndDrop();
      this.setupSortButton(); // Add sort button functionality
      this.setupMobileTrashCan(); // Add mobile trash can
      this.initCoinPouch(); // Initialize coin pouch
      // Remove trash can setup
      try { if (typeof window !== 'undefined') window.Inventory = this; } catch {}
      // Bind debounced render to this context
      this.debouncedRender = debounce(() => this.render(), 16);
    }, { component: 'inventory', operation: 'init' })();
  },

  render() {
    return ErrorHandler.wrap(() => {
      perfMonitor.time('inventory-render');
      
      const grid = document.getElementById('inv-grid');
      if (!grid) return;
      
      // Batch DOM updates for better performance
      batchDomUpdates([
        () => {
          grid.innerHTML = '';
          grid.style.gridTemplateColumns = 'repeat(6, 56px)';
          grid.style.gridTemplateRows = 'repeat(4, 56px)';
        },
        () => {
          // Create all slots in batch
          const fragment = document.createDocumentFragment();
          for (let i = 0; i < this.slots; i++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.index = i;
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            this.setupCellEventListeners(cell, i);
            
            const item = gameState.inventory[i];
            if (item) {
              cell.classList.add('occupied');
              this.createItemElement(cell, item, i);
            } else {
              cell.classList.add('empty');
            }
            
            slot.appendChild(cell);
            fragment.appendChild(slot);
          }
          grid.appendChild(fragment);
        }
      ]);
      
      // Update coin count display
      this.updateCoinCount();
      
      perfMonitor.timeEnd('inventory-render');
    }, { component: 'inventory', operation: 'render' })();
  },

  updateCoinCount() {
    const coinCountEl = document.querySelector('#coin-count');
    if (!coinCountEl) return;
    
    // Use dedicated coins property instead of searching inventory
    const totalCoins = gameState.coins || 0;
    coinCountEl.textContent = totalCoins.toLocaleString();
  },

  // Add coins directly to dedicated coin storage (not inventory slots)
  addCoins(amount = 1) {
    // Initialize coins property if it doesn't exist
    if (!gameState.coins) {
      gameState.coins = 0;
    }
    
    // Add to coin storage (separate from inventory)
    gameState.coins += amount;
    
    this.updateCoinCount();
    SaveManager.debouncedSave();
  },

  setupCellEventListeners(cell, i) {
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', () => {
      cell.classList.remove('drag-over');
      const targetIndex = i;
      if (this.dragFromIndex !== null) {
        const fromIndex = this.dragFromIndex;
        if (fromIndex === targetIndex) return;
        const sourceItem = gameState.inventory[fromIndex];
        const targetItem = gameState.inventory[targetIndex] || null;
        // If same name and type, stack
        if (sourceItem && targetItem && sourceItem.name === targetItem.name && (sourceItem.type || null) === (targetItem.type || null)) {
          const add = Math.max(1, sourceItem.count || 1);
          targetItem.count = Math.max(1, (targetItem.count || 0) + add);
          gameState.inventory[fromIndex] = null;
        } else {
          const temp = targetItem;
          gameState.inventory[targetIndex] = sourceItem;
          gameState.inventory[fromIndex] = temp;
        }
        this.dragFromIndex = null;
        this.debouncedRender();
        AudioManager.playDrop();
        SaveManager.debouncedSave();
        return;
      }
      if (this.dragFromEquipment) {
        if (!gameState.inventory[targetIndex]) {
          const item = gameState.equipment[this.dragFromEquipment];
          if (item) {
            gameState.inventory[targetIndex] = item;
            gameState.equipment[this.dragFromEquipment] = null;
            this.dragFromEquipment = null;
            this.debouncedRender();
            import('../equipment/index.js').then(mod => mod.Equipment.updateUI());
            AudioManager.playDrop();
            SaveManager.debouncedSave();
          }
        } else {
          this.dragFromEquipment = null;
        }
      }
    });
  },

  // Add debounced render method
  debouncedRender: debounce(function() { 
    if (this && this.render) {
      this.render(); 
    } else {
      console.warn('debouncedRender called without proper context');
    }
  }, 16), // 60fps limit

  createItemElement(cell, item, index) {
    const itemEl = document.createElement('div');
    itemEl.className = 'item';
    itemEl.draggable = true;
    itemEl.dataset.index = index;
    const icon = this.createItemIcon(item);
    itemEl.appendChild(icon);
    if (item.count > 1) {
      const count = document.createElement('div');
      count.className = 'item-count';
      count.textContent = item.count;
      itemEl.appendChild(count);
    }
    this.addItemEventListeners(itemEl, item, index);
    cell.appendChild(itemEl);
  },

  createItemIcon(item) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    let symbolId = 'icon-bag';
    let iconColor = '#8B4513';
    
    // First check for equipment types
    const iconMap = {
      helmet: { symbol: 'icon-helmet', color: '#8B4513' },
      chest: { symbol: 'icon-chest-armor', color: '#A0522D' },
      gloves: { symbol: 'icon-gloves', color: '#D2691E' },
      pants: { symbol: 'icon-pants', color: '#CD853F' },
      shoes: { symbol: 'icon-boots', color: '#DEB887' },
      ring: { symbol: 'icon-ring', color: '#FFD700' },
      amulet: { symbol: 'icon-amulet', color: '#9370DB' }
    };
    
    // Fish mapping
    const fishMap = {
      'Minnow': { symbol: 'fish-minnow', color: '#87CEEB' },
      'Trout': { symbol: 'fish-trout', color: '#8FBC8F' },
      'Bass': { symbol: 'fish-bass', color: '#556B2F' },
      'Salmon': { symbol: 'fish-salmon', color: '#FA8072' },
      'Golden Carp': { symbol: 'fish-carp', color: '#FFD700' },
      'Fish': { symbol: 'fish-minnow', color: '#87CEEB' }, // Generic fish
      'Raw Fish': { symbol: 'fish-minnow', color: '#87CEEB' },
      'Cooked Fish': { symbol: 'fish-minnow', color: '#DEB887' }
    };
    
    // Resource/material mapping for common items
    const resourceMap = {
      'Wood': { symbol: 'icon-log', color: '#8B4513' },
      'Logs': { symbol: 'icon-log', color: '#8B4513' },
      'Oak Wood': { symbol: 'icon-log', color: '#8B4513' },
      'Pine Wood': { symbol: 'icon-log', color: '#654321' },
      'Birch Wood': { symbol: 'icon-log', color: '#F5F5DC' },
      'Branch': { symbol: 'icon-log', color: '#CD853F' },
      'Stick': { symbol: 'icon-log', color: '#DEB887' },
      'Driftwood': { symbol: 'icon-driftwood', color: '#8B7355' },
      'Sea Shell': { symbol: 'icon-shell', color: '#F0F8FF' },
      'Seaweed': { symbol: 'icon-seaweed', color: '#228B22' },
      'Stone': { symbol: 'icon-stone', color: '#808080' },
      'Rock': { symbol: 'icon-stone', color: '#696969' },
      'Iron Ore': { symbol: 'icon-ore', color: '#C0C0C0' },
      'Gold Ore': { symbol: 'icon-ore', color: '#FFD700' },
      'Coal': { symbol: 'icon-coal', color: '#2F2F2F' },
      'Gem': { symbol: 'icon-gem', color: '#FF69B4' },
      'Diamond': { symbol: 'icon-gem', color: '#B0E0E6' },
      'Apple': { symbol: 'icon-apple', color: '#FF0000' },
      'Berry': { symbol: 'icon-berry', color: '#8B008B' },
      'Mushroom': { symbol: 'icon-mushroom', color: '#DEB887' },
      'Bread': { symbol: 'icon-bread', color: '#DEB887' },
      'Rope': { symbol: 'icon-rope', color: '#D2691E' },
      'Cloth': { symbol: 'icon-cloth', color: '#F5F5DC' },
      'Leather': { symbol: 'icon-leather', color: '#8B4513' },
      'Feather': { symbol: 'icon-feather', color: '#F0F8FF' }
    };
    
    // Check item type first (for equipment)
    if (item.type && iconMap[item.type]) {
      symbolId = iconMap[item.type].symbol;
      iconColor = iconMap[item.type].color;
    } 
    // Check ItemCatalog
    else if (ItemCatalog[item.name]?.icon) {
      symbolId = ItemCatalog[item.name].icon;
      // keep default color; most item icons have baked-in fills
    } 
    // Check fish mapping
    else if (fishMap[item.name]) {
      symbolId = fishMap[item.name].symbol;
      iconColor = fishMap[item.name].color;
    }
    // Check resource mapping
    else if (resourceMap[item.name]) {
      symbolId = resourceMap[item.name].symbol;
      iconColor = resourceMap[item.name].color;
    }
    // Fallback to checking if the symbol exists with common patterns
    else {
      const itemLower = item.name.toLowerCase();
      if (itemLower.includes('fish')) {
        symbolId = 'fish-minnow';
        iconColor = '#87CEEB';
      } else if (itemLower.includes('wood') || itemLower.includes('log')) {
        symbolId = 'icon-log';
        iconColor = '#8B4513';
      } else if (itemLower.includes('stone') || itemLower.includes('rock')) {
        symbolId = 'icon-stone';
        iconColor = '#808080';
      } else if (itemLower.includes('ore')) {
        symbolId = 'icon-ore';
        iconColor = '#C0C0C0';
      } else if (itemLower.includes('gem') || itemLower.includes('diamond')) {
        symbolId = 'icon-gem';
        iconColor = '#FF69B4';
      }
    }
    
    // Robustly set both href variations for broad browser support
    use.setAttribute('href', `#${symbolId}`);
    try { use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${symbolId}`); } catch {}
    icon.appendChild(use);
    icon.setAttribute('width', '24');
    icon.setAttribute('height', '24');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.style.color = iconColor;
    return icon;
  },

  addItemEventListeners(itemEl, item, index) {
    // Mouse events
    itemEl.addEventListener('mouseenter', (e) => {
      Tooltip.show(e, item.name);
      if (item.type) Equipment.highlightSlots(item.type, 'hover');
    });
    itemEl.addEventListener('mouseleave', () => {
      Tooltip.hide();
      if (item.type) Equipment.clearHighlights('hover');
    });
    itemEl.addEventListener('mousemove', (e) => Tooltip.move(e));
    // Click events (including shift-click for stack splitting)
    itemEl.addEventListener('click', (e) => {
      if (e.shiftKey && item.count > 1) {
        e.preventDefault();
        this.splitItemStack(index, item);
        return;
      }
    });

    itemEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (item?.type) {
        const cursorX = e.clientX;
        const cursorY = e.clientY;
        const equip = window.__equipmentApi?.equipItem || null;
        if (equip) { equip(item, index, { cursorX, cursorY }); }
        else { import('../equipment/index.js').then(mod => mod.Equipment.equipItem(item, index, { cursorX, cursorY })); }
        AudioManager.playClick();
      }
    });

    // Traditional drag events
    itemEl.addEventListener('dragstart', (e) => {
      this.dragFromIndex = index;
      itemEl.classList.add('dragging');
      try { Tooltip.hide(); } catch {}
      try {
        if (e.dataTransfer) {
          e.dataTransfer.setData('application/x-inv-idx', String(index));
          e.dataTransfer.setData('text/x-inv-idx', String(index));
          e.dataTransfer.effectAllowed = 'move';
        }
      } catch {}
      AudioManager.playPickup();
    });
    
    itemEl.addEventListener('mousedown', () => { try { Tooltip.hide(); } catch {} });
    
    itemEl.addEventListener('dragend', () => {
      itemEl.classList.remove('dragging');
      // Don't clear dragFromIndex immediately - let drop handlers use it first
      setTimeout(() => {
        this.dragFromIndex = null;
      }, 10);
      Equipment.clearHighlights('force');
    });

    // Touch drag and drop for mobile
    let touchDragData = null;
    let dragPreview = null;
    let isDragging = false;
    let startPos = { x: 0, y: 0 };

    itemEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      startPos = { x: touch.clientX, y: touch.clientY };
      isDragging = false;
      
      // Prepare for potential drag
      touchDragData = { item, index };
      
      // Show tooltip on touch
      Tooltip.show(touch, item.name);
    }, { passive: false });

    itemEl.addEventListener('touchmove', (e) => {
      if (!touchDragData || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startPos.x);
      const deltaY = Math.abs(touch.clientY - startPos.y);
      
      // Start drag if moved enough
      if (!isDragging && (deltaX > 10 || deltaY > 10)) {
        isDragging = true;
        this.dragFromIndex = index;
        itemEl.classList.add('dragging');
        
        // Create drag preview
        dragPreview = itemEl.cloneNode(true);
        dragPreview.className = 'item drag-preview';
        dragPreview.style.position = 'fixed';
        dragPreview.style.pointerEvents = 'none';
        dragPreview.style.zIndex = '10000';
        dragPreview.style.opacity = '0.8';
        dragPreview.style.transform = 'scale(1.1)';
        document.body.appendChild(dragPreview);
        
        Tooltip.hide();
        AudioManager.playPickup();
      }
      
      if (isDragging && dragPreview) {
        e.preventDefault();
        dragPreview.style.left = (touch.clientX - 25) + 'px';
        dragPreview.style.top = (touch.clientY - 25) + 'px';
        
        // Highlight drop targets
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        this.updateTouchDropTargets(elementBelow);
      }
    }, { passive: false });

    itemEl.addEventListener('touchend', (e) => {
      if (!touchDragData) return;
      
      if (isDragging) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        
        this.handleTouchDrop(dropTarget, touchDragData);
        
        // Cleanup
        if (dragPreview) {
          dragPreview.remove();
          dragPreview = null;
        }
        
        itemEl.classList.remove('dragging');
        this.clearTouchDropTargets();
      } else {
        // Short tap - show context menu or equip
        if (item?.type) {
          const touch = e.changedTouches[0];
          const cursorX = touch.clientX;
          const cursorY = touch.clientY;
          const equip = window.__equipmentApi?.equipItem || null;
          if (equip) { equip(item, index, { cursorX, cursorY }); }
          else { import('../equipment/index.js').then(mod => mod.Equipment.equipItem(item, index, { cursorX, cursorY })); }
          AudioManager.playClick();
        }
      }
      
      Tooltip.hide();
      touchDragData = null;
      isDragging = false;
      
      setTimeout(() => {
        this.dragFromIndex = null;
      }, 10);
    }, { passive: false });
  },

  // Context menu removed in favor of right-click equip

  addItem(name, type = null, animationSource = null) {
    // Handle coins specially - add to coin pouch
    if (name === 'Coin' || name === 'Coins' || name === 'Gold Coin' || name === 'Small Coin') {
      this.addCoins(1);
      return;
    }
    
    const existing = gameState.inventory.find(i => i && i.name === name && (i.type || null) === (type || null));
    if (existing) { 
      existing.count++; 
      this.debouncedRender(); 
      SaveManager.debouncedSave(); // Auto-save after adding item
      
      // Animate to existing item slot if inventory is open
      this.animateItemToSlot(name, existing, animationSource);
      return; 
    }
    
    for (let i = 0; i < this.slots; i++) {
      if (!gameState.inventory[i]) { 
        const newItem = { name, count: 1, type: (type || null) };
        gameState.inventory[i] = newItem; 
        this.debouncedRender(); 
        SaveManager.debouncedSave(); // Auto-save after adding new item
        
        // Animate to new item slot if inventory is open
        this.animateItemToSlot(name, newItem, animationSource, i);
        return; 
      }
    }
    const log = document.getElementById('game-log');
    if (log) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = 'Inventory is full!';
      log.prepend(entry);
    }
  },

  // Animate item to specific inventory slot if inventory panel is open
  animateItemToSlot(itemName, item, animationSource, slotIndex = null) {
    // Check if inventory panel is open
    const inventoryPanel = document.getElementById('panel-inventory');
    if (!inventoryPanel || inventoryPanel.style.display === 'none') {
      return; // No animation if inventory is closed
    }
    
    // Find the target slot
    let targetSlot = null;
    if (slotIndex !== null) {
      // New item - use specific slot index
      targetSlot = document.querySelector(`[data-index="${slotIndex}"]`);
    } else {
      // Existing item - find the slot containing this item
      const allSlots = document.querySelectorAll('.cell');
      for (let i = 0; i < allSlots.length; i++) {
        const slotItem = gameState.inventory[i];
        if (slotItem && slotItem.name === itemName && slotItem === item) {
          targetSlot = allSlots[i];
          break;
        }
      }
    }
    
    if (!targetSlot || !animationSource) return;
    
    // Create animated item element
    const animatedItem = document.createElement('div');
    animatedItem.className = 'animated-item';
    animatedItem.style.position = 'fixed';
    animatedItem.style.width = '24px';
    animatedItem.style.height = '24px';
    animatedItem.style.zIndex = '50000';
    animatedItem.style.pointerEvents = 'none';
    animatedItem.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    
    // Create item icon
    const icon = this.createItemIcon({ name: itemName, type: item.type });
    if (icon) {
      animatedItem.appendChild(icon);
    } else {
      animatedItem.textContent = itemName.charAt(0);
      animatedItem.style.backgroundColor = 'var(--border-primary)';
      animatedItem.style.color = 'var(--text-primary)';
      animatedItem.style.display = 'flex';
      animatedItem.style.alignItems = 'center';
      animatedItem.style.justifyContent = 'center';
      animatedItem.style.fontSize = '12px';
      animatedItem.style.borderRadius = '4px';
    }
    
    // Get source and target positions
    const sourceRect = animationSource.getBoundingClientRect();
    const targetRect = targetSlot.getBoundingClientRect();
    
    // Position at source
    animatedItem.style.left = `${sourceRect.left + sourceRect.width / 2 - 12}px`;
    animatedItem.style.top = `${sourceRect.top + sourceRect.height / 2 - 12}px`;
    
    document.body.appendChild(animatedItem);
    
    // Animate to target
    requestAnimationFrame(() => {
      animatedItem.style.left = `${targetRect.left + targetRect.width / 2 - 12}px`;
      animatedItem.style.top = `${targetRect.top + targetRect.height / 2 - 12}px`;
      animatedItem.style.transform = 'scale(1.2)';
    });
    
    // Remove animated element after animation
    setTimeout(() => {
      if (animatedItem.parentNode) {
        animatedItem.style.opacity = '0';
        animatedItem.style.transform = 'scale(0.8)';
        setTimeout(() => {
          animatedItem.remove();
        }, 200);
      }
    }, 600);
  },

  setupDragAndDrop() {
    return ErrorHandler.wrap(() => {
      const grid = document.getElementById('inv-grid');
      if (!grid) return;
      
      grid.addEventListener('dragover', (e) => e.preventDefault());
      grid.addEventListener('drop', (e) => {
        e.preventDefault();
        
        // Handle inventory-to-inventory drops outside specific slots
        if (this.dragFromIndex !== null) {
          // If dropping on the grid but not on a specific slot, do nothing
          // The item should stay in its original position
          console.log('Dropped on grid, keeping item in original position');
        }
        
        // Clear drag state
        this.dragFromIndex = null;
        this.dragFromEquipment = null;
      });
    }, { component: 'inventory', operation: 'setupDragAndDrop' })();
  },

  setupSortButton() {
    const sortBtn = document.getElementById('sort-inventory-btn');
    if (!sortBtn) return;
    // Toggle auto-sort mode
    const AUTO_KEY = 'inventory_auto_sort';
    const applyState = (enabled) => {
      sortBtn.classList.toggle('active', !!enabled);
      sortBtn.title = enabled ? 'Auto-sort: ON (click to disable)' : 'Auto-sort: OFF (click to enable)';
      // Persist setting
      try { localStorage.setItem(AUTO_KEY, enabled ? '1' : '0'); } catch {}
    };
    // Initialize from storage
    let autoSort = false;
    try { autoSort = localStorage.getItem(AUTO_KEY) === '1'; } catch {}
    applyState(autoSort);

    sortBtn.addEventListener('click', () => {
      autoSort = !autoSort;
      applyState(autoSort);
      AudioManager.playClick();
      if (autoSort) this.sortByCategory();
    });

    // Hook into render to apply auto-sort when enabled
    const originalRender = this.render.bind(this);
    this.render = () => {
      if (autoSort) {
        // Avoid infinite loop: only sort the in-memory array then render once
        this.sortInMemoryByCategory();
      }
      return originalRender();
    };
  },

  // Setup mobile-only trash can
  setupMobileTrashCan() {
    const inventoryHeader = document.querySelector('#panel-inventory .inventory-info');
    if (!inventoryHeader) return;
    
    // Check if trash can already exists
    const existingTrash = document.getElementById('mobile-trash-btn');
    
    const updateTrashVisibility = () => {
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile && !existingTrash) {
        // Create trash can for mobile
        const trashBtn = document.createElement('button');
        trashBtn.id = 'mobile-trash-btn';
        trashBtn.className = 'header-btn mobile-trash-can';
        trashBtn.title = 'Delete Item (Drop here)';
        trashBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        `;
        
        // Add drop zone styling for trash can
        trashBtn.addEventListener('dragover', (e) => {
          e.preventDefault();
          trashBtn.classList.add('trash-drag-over');
        });
        
        trashBtn.addEventListener('dragleave', () => {
          trashBtn.classList.remove('trash-drag-over');
        });
        
        trashBtn.addEventListener('drop', (e) => {
          e.preventDefault();
          trashBtn.classList.remove('trash-drag-over');
          
          // Handle item deletion
          if (this.dragFromIndex !== null) {
            const item = gameState.inventory[this.dragFromIndex];
            if (item) {
              gameState.inventory[this.dragFromIndex] = null;
              this.dragFromIndex = null;
              this.debouncedRender();
              AudioManager.playDelete?.() || AudioManager.playDrop();
              SaveManager.debouncedSave();
            }
          }
        });
        
        inventoryHeader.appendChild(trashBtn);
      } else if (!isMobile && existingTrash) {
        // Remove trash can on desktop
        existingTrash.remove();
      }
    };
    
    // Initial setup
    updateTrashVisibility();
    
    // Listen for window resize to show/hide trash can
    window.addEventListener('resize', updateTrashVisibility);
  },

  // Initialize coin pouch display
  initCoinPouch() {
    const coinPouchSetup = setInterval(() => {
      const coinPouch = document.querySelector('.coin-pouch');
      if (coinPouch) {
        this.updateCoinCount();
        clearInterval(coinPouchSetup);
      }
    }, 100);
  },

  splitItemStack(sourceIndex, item) {
    ErrorHandler.wrap(() => {
      if (!item || item.count <= 1) return;
      
      const halfAmount = Math.floor(item.count / 2);
      const remainingAmount = item.count - halfAmount;
      
      // Find an empty slot for the split stack
      let emptySlotIndex = -1;
      for (let i = 0; i < this.slots; i++) {
        if (!gameState.inventory[i]) {
          emptySlotIndex = i;
          break;
        }
      }
      
      if (emptySlotIndex === -1) {
        // No empty slots, show message
        const status = document.getElementById('status');
        if (status) {
          status.textContent = 'No empty slots for splitting!';
          setTimeout(() => { status.textContent = ''; }, 2000);
        }
        return;
      }
      
      // Update the original stack
      gameState.inventory[sourceIndex].count = remainingAmount;
      
      // Create the new split stack
      gameState.inventory[emptySlotIndex] = {
        name: item.name,
        count: halfAmount,
        type: item.type || null
      };
      
      // Play sound and update UI
      AudioManager.playClick();
      this.debouncedRender();
      SaveManager.debouncedSave();
      
      // Show feedback
      const status = document.getElementById('status');
      if (status) {
        status.textContent = `Split ${item.name}: ${remainingAmount} + ${halfAmount}`;
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
    }, { component: 'inventory', operation: 'splitItemStack' })();
  },

  sortByCategory() {
    ErrorHandler.wrap(() => {
      const items = gameState.inventory.filter(item => item !== null);
      
      // Define category priorities (lower number = higher priority)
      const categoryPriority = {
        // Equipment
        'helmet': 1, 'chest': 2, 'gloves': 3, 'pants': 4, 'shoes': 5,
        'ring': 6, 'amulet': 7,
        // Tools
        'tool': 10,
        // Fish (by rarity/value)
        'fish': 20,
        // Resources
        'resource': 30,
        // Generic items
        'item': 40,
        // Unknown/null
        'unknown': 50
      };
      
      // Function to get category priority
      const getCategoryPriority = (item) => {
        // Equipment types
        if (item.type && categoryPriority[item.type] !== undefined) {
          return categoryPriority[item.type];
        }
        
        // Fish detection
        const fishNames = ['Minnow', 'Trout', 'Bass', 'Salmon', 'Golden Carp'];
        if (fishNames.includes(item.name)) {
          // Sort fish by rarity (reverse order of fishNames array)
          const fishIndex = fishNames.indexOf(item.name);
          return categoryPriority.fish + (fishNames.length - fishIndex);
        }
        
        // Tools
        if (item.name.toLowerCase().includes('pole') || 
            item.name.toLowerCase().includes('rod') ||
            item.name.toLowerCase().includes('axe') ||
            item.name.toLowerCase().includes('pickaxe')) {
          return categoryPriority.tool;
        }
        
        // Resources
        const resourceNames = ['Wood', 'Stone', 'Iron Ore', 'Gold Ore', 'Coal', 
                             'Driftwood', 'Sea Shell', 'Seaweed', 'Branch', 'Stick'];
        if (resourceNames.some(resource => item.name.includes(resource))) {
          return categoryPriority.resource;
        }
        
        return categoryPriority.unknown;
      };
      
      // Sort by category priority, then by name within category
      items.sort((a, b) => {
        const aPriority = getCategoryPriority(a);
        const bPriority = getCategoryPriority(b);
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // Same category, sort by name
        return (a.name || '').localeCompare(b.name || '');
      });
      
      gameState.inventory.fill(null);
      items.forEach((item, index) => { gameState.inventory[index] = item; });
      this.debouncedRender();
      SaveManager.debouncedSave();
      
      // Show feedback
      const status = document.getElementById('status');
      if (status) {
        status.textContent = 'Inventory sorted by category';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
    }, { component: 'inventory', operation: 'sortByCategory' })();
  },

  // Non-saving, in-memory sort used by auto-sort before render
  sortInMemoryByCategory() {
    try {
      const items = gameState.inventory.filter(item => item !== null);
      const categoryPriority = {
        'helmet': 1, 'chest': 2, 'gloves': 3, 'pants': 4, 'shoes': 5,
        'ring': 6, 'amulet': 7,
        'tool': 10,
        'fish': 20,
        'resource': 30,
        'item': 40,
        'unknown': 50
      };
      const getCategoryPriority = (item) => {
        if (item.type && categoryPriority[item.type] !== undefined) return categoryPriority[item.type];
        const fishNames = ['Minnow', 'Trout', 'Bass', 'Salmon', 'Golden Carp'];
        if (fishNames.includes(item.name)) {
          const fishIndex = fishNames.indexOf(item.name);
          return categoryPriority.fish + (fishNames.length - fishIndex);
        }
        if (item.name.toLowerCase().includes('pole') || item.name.toLowerCase().includes('rod') || item.name.toLowerCase().includes('axe') || item.name.toLowerCase().includes('pickaxe')) return categoryPriority.tool;
        const resourceNames = ['Wood', 'Stone', 'Iron Ore', 'Gold Ore', 'Coal', 'Driftwood', 'Sea Shell', 'Seaweed', 'Branch', 'Stick'];
        if (resourceNames.some(resource => item.name.includes(resource))) return categoryPriority.resource;
        return categoryPriority.unknown;
      };
      items.sort((a, b) => {
        const aP = getCategoryPriority(a);
        const bP = getCategoryPriority(b);
        if (aP !== bP) return aP - bP;
        return (a.name || '').localeCompare(b.name || '');
      });
      gameState.inventory.fill(null);
      items.forEach((item, index) => { gameState.inventory[index] = item; });
    } catch {}
  },

  // Touch drag and drop helper methods
  updateTouchDropTargets(elementBelow) {
    // Clear previous highlights
    this.clearTouchDropTargets();
    
    if (!elementBelow) return;
    
    // Check for inventory slots
    const cell = elementBelow.closest('.cell');
    if (cell) {
      cell.classList.add('touch-drag-over');
      return;
    }
    
    // Check for equipment slots
    const equipSlot = elementBelow.closest('.equipment-slot');
    if (equipSlot) {
      equipSlot.classList.add('touch-drag-over');
      return;
    }
    
    // Check for trash can
    const trashCan = elementBelow.closest('.mobile-trash-can');
    if (trashCan) {
      trashCan.classList.add('trash-drag-over');
      return;
    }
    
    // Check for ground drop
    const gameContent = elementBelow.closest('.game-content, .content-panel');
    if (gameContent && !elementBelow.closest('.panel, .inventory-panel, .equipment-panel')) {
      gameContent.classList.add('touch-drag-over');
    }
  },

  clearTouchDropTargets() {
    document.querySelectorAll('.touch-drag-over, .trash-drag-over').forEach(el => {
      el.classList.remove('touch-drag-over', 'trash-drag-over');
    });
  },

  handleTouchDrop(dropTarget, dragData) {
    if (!dropTarget || !dragData) return;
    
    // Drop on inventory slot
    const cell = dropTarget.closest('.cell');
    if (cell) {
      const targetIndex = parseInt(cell.dataset.index);
      if (targetIndex !== dragData.index) {
        const sourceItem = gameState.inventory[dragData.index];
        const targetItem = gameState.inventory[targetIndex] || null;
        if (sourceItem && targetItem && sourceItem.name === targetItem.name && (sourceItem.type || null) === (targetItem.type || null)) {
          const add = Math.max(1, sourceItem.count || 1);
          targetItem.count = Math.max(1, (targetItem.count || 0) + add);
          gameState.inventory[dragData.index] = null;
        } else {
          const temp = targetItem;
          gameState.inventory[targetIndex] = sourceItem;
          gameState.inventory[dragData.index] = temp;
        }
        this.debouncedRender();
        AudioManager.playDrop();
        SaveManager.debouncedSave();
      }
      return;
    }
    
    // Drop on equipment slot
    const equipSlot = dropTarget.closest('.equipment-slot');
    if (equipSlot) {
      const slotType = equipSlot.dataset.slot;
      const item = gameState.inventory[dragData.index];
      if (item && item.type === slotType) {
        // Swap with existing equipment if any
        const existingItem = gameState.equipment[slotType];
        gameState.equipment[slotType] = item;
        gameState.inventory[dragData.index] = existingItem;
        this.debouncedRender();
        import('../equipment/index.js').then(mod => mod.Equipment.updateUI());
        AudioManager.playEquip?.() || AudioManager.playDrop();
        SaveManager.debouncedSave();
      }
      return;
    }
    
    // Drop on trash can
    const trashCan = dropTarget.closest('.mobile-trash-can');
    if (trashCan) {
      gameState.inventory[dragData.index] = null;
      this.debouncedRender();
      AudioManager.playDelete?.() || AudioManager.playDrop();
      SaveManager.debouncedSave();
      return;
    }
    
    // Drop on ground (open area)
    const gameContent = dropTarget.closest('.game-content, .content-panel');
    if (gameContent && !dropTarget.closest('.panel, .inventory-panel, .equipment-panel')) {
      // Create ground item
      const item = gameState.inventory[dragData.index];
      if (item) {
        gameState.inventory[dragData.index] = null;
        this.debouncedRender();
        
        // Import and create ground item
        import('../exploration/index.js').then(({ Exploration }) => {
          const rect = gameContent.getBoundingClientRect();
          const x = Math.random() * (rect.width - 100) + 50;
          const y = Math.random() * (rect.height - 100) + 50;
          Exploration.createGroundItem(item, x, y);
        });
        
        AudioManager.playDrop();
        SaveManager.debouncedSave();
      }
    }
  }
};


