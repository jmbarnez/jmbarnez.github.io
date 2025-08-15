import { clamp } from '../../core/dom.js';
import { gameState, SETTINGS, Locations } from '../../state/gameState.js';
import { DiscoveryPools, MAX_DISCOVERY_CARDS, ItemCatalog } from '../../data/content.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { IdleManager } from '../../systems/IdleManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { Inventory } from '../inventory/index.js';

export const Exploration = {
  maxCards: MAX_DISCOVERY_CARDS,
  pinnedIds: new Set(),
  _groundAttached: false,

  attachGroundDropHandlers() {
    if (this._groundAttached) return;
    const areaEl = document.querySelector('.game-content') || document.querySelector('.content-panel.active') || document.getElementById('game');
    if (!areaEl) return;
    this._groundAttached = true;
    
    areaEl.addEventListener('dragover', (e) => { 
      e.preventDefault(); 
      // Show drop zone when dragging from inventory/equipment or ground items
      const invApi = window?.Inventory;
      const isGroundDrag = e.dataTransfer.types.includes('text/ground-item');
      
      if ((invApi && (invApi.dragFromIndex !== null || invApi.dragFromEquipment)) || isGroundDrag) {
        areaEl.classList.add('drag-over');
      }
    });
    
    areaEl.addEventListener('dragleave', () => { 
      areaEl.classList.remove('drag-over');
    });
    
    areaEl.addEventListener('drop', (e) => {
      e.preventDefault();
      areaEl.classList.remove('drag-over');
      
      // Handle ground item repositioning
      const groundItemId = e.dataTransfer.getData('text/ground-item');
      if (groundItemId) {
        const groundItem = document.querySelector(`[data-card-id="${groundItemId}"]`);
        if (groundItem) {
          this.repositionGroundItem(groundItem, e.clientX, e.clientY);
          AudioManager.playDrop();
          return;
        }
      }
      
      // Simple rule: If dragging from inventory/equipment and NOT dropping on a panel, drop to ground
      const target = e.target;
      const isPanel = target?.closest('.panel, .inventory-panel, .equipment-panel, .skills-panel, .chat-panel, #inv-grid, .equipment-slot, .skill-card, .slot');
      
      if (isPanel) {
        // Dropped on a panel/UI element - don't create ground item
        console.log('Dropped on panel, no ground item created');
        return;
      }
      
      // Dropped in open area - create ground item
      let droppedItem = null;
      const invApi = window?.Inventory;
      
      console.log('Drop detected - dragFromIndex:', invApi?.dragFromIndex, 'dragFromEquipment:', invApi?.dragFromEquipment);
      
      // Handle inventory drops
      if (invApi && invApi.dragFromIndex !== null && invApi.dragFromIndex !== undefined) {
        const idx = invApi.dragFromIndex;
        const item = gameState.inventory[idx];
        console.log('Processing inventory drop for index', idx, 'item:', item);
        if (item && item.name) {
          droppedItem = { name: item.name, type: item.type, count: item.count || 1 };
          gameState.inventory[idx] = null;
          console.log('Removed item from inventory slot', idx);
          Inventory.debouncedRender();
        }
      }
      
      // Handle equipment drops
      if (invApi && invApi.dragFromEquipment) {
        const slotType = invApi.dragFromEquipment;
        const item = gameState.equipment[slotType];
        console.log('Processing equipment drop for slot', slotType, 'item:', item);
        if (item && item.name) {
          droppedItem = { name: item.name, type: item.type };
          gameState.equipment[slotType] = null;
          import('../equipment/index.js').then(mod => mod.Equipment.debouncedUpdateUI());
        }
      }
      
      // Create ground item if we dropped something
      if (droppedItem && droppedItem.name && droppedItem.name !== 'Unknown') {
        console.log('Creating ground item:', droppedItem);
        const container = document.getElementById('discoveries') || areaEl;
        const spawnX = e.clientX;
        const spawnY = e.clientY;
        
        AudioManager.playDrop();
        this.createGroundItem({
          name: droppedItem.name,
          type: droppedItem?.type || null,
          count: droppedItem?.count || 1
        }, { spawnAtClient: { x: spawnX, y: spawnY } });
      } else {
        console.log('No valid item to drop');
      }
      
      // Clear drag states after processing
      if (invApi) {
        invApi.dragFromIndex = null;
        invApi.dragFromEquipment = null;
      }
    });
  },

  repositionGroundItem(groundItem, clientX, clientY) {
    const container = groundItem.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const itemRect = groundItem.getBoundingClientRect();
    
    // Calculate new position relative to container
    const newX = clientX - containerRect.left - (itemRect.width / 2);
    const newY = clientY - containerRect.top - (itemRect.height / 2);
    
    // Constrain to container bounds
    const padding = 8;
    const maxX = containerRect.width - itemRect.width - padding;
    const maxY = containerRect.height - itemRect.height - padding;
    
    const constrainedX = Math.max(padding, Math.min(maxX, newX));
    const constrainedY = Math.max(padding, Math.min(maxY, newY));
    
    // Apply new position
    groundItem.style.left = `${constrainedX}px`;
    groundItem.style.top = `${constrainedY}px`;
  },

  start() {
    // Block starting exploration while any idle job is active (e.g., fishing); also cancel fishing explicitly if needed
    try {
      if (IdleManager.hasAnyActive()) {
        const status = document.getElementById('status');
        if (status) status.textContent = 'Finish your current activity before exploring.';
        return;
      }
      // Also prevent if fishing flag somehow active
      if (typeof IdleManager.hasActiveOfKind === 'function' && IdleManager.hasActiveOfKind('fishing')) {
        const status = document.getElementById('status');
        if (status) status.textContent = 'Stop fishing before exploring.';
        return;
      }
    } catch {}
    if (gameState.isExploring) return;
    gameState.isExploring = true;
    const badge = document.getElementById('locationBadge');
    if (badge) { badge.classList.add('exploring'); badge.classList.remove('discovered'); }
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) exploreBtn.classList.add('exploring');
    const btn = document.getElementById('exploreBtn');
    const lbl = document.getElementById('exploreBtnLabel');
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
    if (lbl) lbl.textContent = 'Stop Exploring';
    const status = document.getElementById('status');
    if (status && !status.textContent.includes('Listed')) { // Don't override market messages
      status.textContent = 'Exploring...';
    }
    try { AudioManager.startWalkingSounds(); } catch {}
    // Clear any lingering discovery badge state when starting
    try { document.getElementById('locationBadge')?.classList.remove('discovered'); } catch {}
    this.continue();
    try { AudioManager.playClick(); } catch {}
    try { this.attachGroundDropHandlers(); } catch {}
  },

  stop() {
    if (!gameState.isExploring) return;
    gameState.isExploring = false;
    const badge = document.getElementById('locationBadge');
    if (badge) badge.classList.remove('exploring');
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) exploreBtn.classList.remove('exploring');
    const btn = document.getElementById('exploreBtn');
    const lbl = document.getElementById('exploreBtnLabel');
    if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
    if (lbl) lbl.textContent = 'Explore';
    try { AudioManager.stopWalkingSounds(); } catch {}
  },

  continue() {
    if (!gameState.isExploring) return;
    const baseTime = 5000;
    const levelReduction = (gameState.exploration.level - 1) * 200;
    const explorationTime = Math.max(2000, baseTime - levelReduction);
    setTimeout(() => this.rollForDiscovery(), explorationTime);
  },

  rollForDiscovery() {
    if (!gameState.isExploring) return;
    const base = SETTINGS.highDiscoveryTest ? 85 : 25;
    const discoveryChance = base + (gameState.exploration.level * 2);
    const roll = Math.random() * 100;
    if (roll < discoveryChance) {
      // Present one or more ground items without stopping; enforce a simple cap
      const container = document.getElementById('discoveries');
      const getCount = () => (container ? container.querySelectorAll('.ground-item').length : 0);
      // Burst count: usually 1, sometimes more
      let count = 1;
      if (Math.random() < 0.35) count += 1; // ~35% chance of 2
      if (Math.random() < 0.15) count += 1; // ~15% chance of 3
      if (Math.random() < 0.05) count += 1; // ~5% chance of 4
      for (let i = 0; i < count; i++) {
        const d = this.getRandomDiscovery();
        if (d && getCount() < this.maxCards) this.createGroundItem(d);
      }
      // Continue exploration timer if not stopped
      this.continue();
    } else {
      const messages = [
        'Walking along the sandy shoreline...',
        'Searching through washed-up seaweed...',
        'Looking for shells in the tide pools...',
        'Checking behind weathered driftwood...'
      ];
      const el = document.getElementById('status');
      if (el) el.textContent = messages[Math.floor(Math.random() * messages.length)];
      gameState.stats.stamina = clamp(gameState.stats.stamina - 3, 0, gameState.stats.staminaMax);
      gameState.stats.mana = clamp(gameState.stats.mana - 1, 0, gameState.stats.manaMax);
      const hpBar = document.getElementById('stamina-bar'); if (hpBar) hpBar.style.width = `${(gameState.stats.stamina / gameState.stats.staminaMax) * 100}%`;
      const manaBar = document.getElementById('mana-bar'); if (manaBar) manaBar.style.width = `${(gameState.stats.mana / gameState.stats.manaMax) * 100}%`;
      this.gainXP(1);
      SaveManager.debouncedSave(); // Auto-save after exploration progress
      this.continue();
    }
  },

  getRandomDiscovery() {
    const locKey = (Locations?.current?.key) || 'beach';
    const pool = DiscoveryPools[locKey] || DiscoveryPools.beach || [];
    const eligible = pool.filter(d => (d.minLevel || 1) <= gameState.exploration.level);
    const weighted = [];
    eligible.forEach(d => { for (let i = 0; i < (d.rarity || 1); i++) weighted.push(d); });
    return weighted[Math.floor(Math.random() * Math.max(1, weighted.length))];
  },

  // ----- Layout helpers -----
  arrange(type = 'spiral') {
    const container = document.getElementById('discoveries');
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.ground-item'));
    const area = container.getBoundingClientRect();
    const cx = area.width / 2; const cy = area.height / 2;
    const baseR = 100; const stepR = 36; const stepTheta = Math.PI / 6;
    cards.forEach((card, i) => {
      if (this.pinnedIds.has(card.dataset.cardId)) return; // skip pinned
      let x = cx, y = cy;
      if (type === 'spiral') {
        const r = baseR + i * (stepR * 0.55);
        const t = i * stepTheta;
        x = cx + r * Math.cos(t);
        y = cy + r * Math.sin(t);
      } else if (type === 'flower') {
        const petals = 6;
        const r = baseR + (i % petals) * 18 + Math.floor(i / petals) * 28;
        const t = (i % petals) * ((Math.PI * 2) / petals) + Math.floor(i / petals) * 0.5;
        x = cx + r * Math.cos(t);
        y = cy + r * Math.sin(t);
      } else if (type === 'orbit') {
        const ring = Math.floor(i / 8);
        const r = baseR + ring * 80;
        const perRing = 8 + ring * 4;
        const t = (i % perRing) * ((Math.PI * 2) / perRing);
        x = cx + r * Math.cos(t);
        y = cy + r * Math.sin(t);
      }
      card.style.transition = 'left 220ms ease, top 220ms ease';
      const cw = card.offsetWidth || 56;
      const ch = card.offsetHeight || 56;
      card.style.left = `${x - cw/2}px`;
      card.style.top = `${y - ch/2}px`;
      setTimeout(() => (card.style.transition = 'none'), 240);
    });
  },

  tidy() { this.arrange('spiral'); },

  animateToInventory(card) {
    try {
      const dockBtn = document.getElementById('toggleInventory');
      const invGrid = document.getElementById('inv-grid');
      if (!dockBtn && !invGrid) return;
      const iconEl = card.querySelector('.disc-icon svg, .idle-ring-inner svg');
      if (!iconEl) return;
      const rectFrom = iconEl.getBoundingClientRect();
      const rectTo = (dockBtn || invGrid).getBoundingClientRect();
      const ghost = iconEl.cloneNode(true);
      ghost.classList.add('fly-item');
      ghost.style.left = `${rectFrom.left}px`;
      ghost.style.top = `${rectFrom.top}px`;
      document.body.appendChild(ghost);
      requestAnimationFrame(() => {
        const dx = rectTo.left - rectFrom.left + (rectTo.width / 2 - 14);
        const dy = rectTo.top - rectFrom.top + (rectTo.height / 2 - 14);
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`;
        ghost.style.opacity = '0';
      });
      setTimeout(() => ghost.remove(), 600);
    } catch {}
  },

  spawnXpFloat(card, text) {
    try {
      const rect = card.getBoundingClientRect();
      const tag = document.createElement('div');
      tag.className = 'xp-float';
      tag.textContent = text;
      tag.style.left = `${rect.left + rect.width / 2 - 20}px`;
      tag.style.top = `${rect.top + 10}px`;
      document.body.appendChild(tag);
      setTimeout(() => tag.remove(), 1000);
    } catch {}
  },

  createGroundItem(item, options = {}) {
    // Validate item has a proper name
    if (!item || !item.name || item.name === 'Unknown' || typeof item.name !== 'string' || item.name.trim() === '') {
      console.warn('Attempted to create ground item with invalid name:', item);
      return;
    }
    
    const opts = options || {};
    const container = document.getElementById('discoveries') || document.querySelector('.game-content') || document.querySelector('.content-panel.active') || document.getElementById('game');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'ground-item';
    const cardId = `ground-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    card.dataset.cardId = cardId;
    card.dataset.itemName = item.name;
    card.dataset.itemType = item.type || '';
    card.dataset.itemCount = item.count || 1;
    card.dataset.category = item.category || 'ground';
    if (item.subtype) card.dataset.subtype = item.subtype;

    const qty = item.count || (typeof opts.qty === 'number' ? opts.qty : (Math.random() < 0.2 ? 2 : 1));
    
    // Get the correct icon - use discovery logic if item has icon field, otherwise use item logic
    const iconId = item.icon || this.getItemIcon(item);
    
    // Display name with count if > 1
    const displayName = qty > 1 ? `${item.name} (x${qty})` : item.name;

    card.innerHTML = `
      <div class="disc-icon">
        <svg aria-hidden="true"><use href="#${iconId}" xlink:href="#${iconId}"/></svg>
      </div>
      <div class="discovery-title">${displayName}</div>
    `;

    card.draggable = true;
    container.appendChild(card);

    // Position the item using the same logic as discovery cards
    const area = container.getBoundingClientRect();
    const center = document.getElementById('exploreBtn')?.getBoundingClientRect();
    const cx = center ? (center.left + center.width/2) : (area.left + area.width/2);
    const cy = center ? (center.top + center.height/2) : (area.top + area.height/2);
    let x = cx, y = cy;
    
    if (opts.spawnAtClient && typeof opts.spawnAtClient.x === 'number' && typeof opts.spawnAtClient.y === 'number') {
      x = opts.spawnAtClient.x;
      y = opts.spawnAtClient.y;
    }

    const half = (card.offsetWidth || 56) / 2;
    const toLocal = (X, Y) => ({ x: X - area.left - half, y: Y - area.top - half });
    
    // Animate outward like original discovery cards
    if (!opts.spawnAtClient) {
      const angle = Math.random() * Math.PI * 2;
      let vx = Math.cos(angle) * (1.5 + Math.random() * 2);
      let vy = Math.sin(angle) * (1.5 + Math.random() * 2);
      const friction = 0.92;
      
      const place = () => {
        const pad = 4;
        const cw = card.offsetWidth || 56;
        const ch = card.offsetHeight || 56;
        const minX = area.left + pad + cw/2, maxX = area.right - pad - cw/2;
        const minY = area.top + pad + ch/2, maxY = area.bottom - pad - ch/2;
        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));
        const p = toLocal(x, y);
        card.style.left = `${p.x}px`;
        card.style.top = `${p.y}px`;
      };
      
      place();
      let steps = 40;
      const step = () => {
        vx *= friction;
        vy *= friction;
        x += vx * 6;
        y += vy * 6;
        place();
        if (--steps > 0) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else {
      const place = () => {
        const pad = 4;
        const cw = card.offsetWidth || 56;
        const ch = card.offsetHeight || 56;
        const minX = area.left + pad + cw/2, maxX = area.right - pad - cw/2;
        const minY = area.top + pad + ch/2, maxY = area.bottom - pad - ch/2;
        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));
        const p = toLocal(x, y);
        card.style.left = `${p.x}px`;
        card.style.top = `${p.y}px`;
      };
      place();
    }

    // Add interaction handlers
    this.addGroundItemHandlers(card, { ...item, count: qty }, opts);

    return card;
  },

  getItemIcon(item) {
    // Check ItemCatalog first for specific item icons
    if (ItemCatalog[item.name]?.icon) {
      return ItemCatalog[item.name].icon;
    }
    
    // Check fish icons
    const fishMap = { 
      'Minnow':'fish-minnow', 
      'Trout':'fish-trout', 
      'Bass':'fish-bass', 
      'Salmon':'fish-salmon', 
      'Golden Carp':'fish-carp' 
    };
    if (fishMap[item.name]) return fishMap[item.name];
    
    // Only use equipment icons for actual equipment
    const iconMap = { 
      helmet:'icon-helmet', 
      chest:'icon-chest-armor', 
      gloves:'icon-gloves', 
      pants:'icon-pants', 
      shoes:'icon-boots', 
      ring:'icon-ring', 
      amulet:'icon-amulet' 
    };
    if (item.type && iconMap[item.type]) return iconMap[item.type];
    
    return 'icon-bag';
  },

  addGroundItemHandlers(card, item, opts = {}) {
    // Make ground items draggable
    card.draggable = true;
    card.style.cursor = 'grab';
    
    let isDragging = false;
    let dragStartPos = { x: 0, y: 0 };
    let initialPos = { x: 0, y: 0 };
    
    // Simple click to collect
    const onClick = (ev) => {
      if (isDragging) return; // Don't collect if we were dragging
      ev.preventDefault();
      this.collectGroundItem(card, item, opts);
    };

    // Drag start
    card.addEventListener('dragstart', (e) => {
      isDragging = true;
      dragStartPos.x = e.clientX;
      dragStartPos.y = e.clientY;
      
      const rect = card.getBoundingClientRect();
      initialPos.x = rect.left;
      initialPos.y = rect.top;
      
      card.style.cursor = 'grabbing';
      card.classList.add('dragging');
      
      // Set drag data
      e.dataTransfer.setData('text/ground-item', card.dataset.cardId);
      e.dataTransfer.effectAllowed = 'move';
      
      AudioManager.playPickup();
    });
    
    // Drag end
    card.addEventListener('dragend', (e) => {
      card.style.cursor = 'grab';
      card.classList.remove('dragging');
      
      // Small delay before allowing clicks again
      setTimeout(() => {
        isDragging = false;
      }, 100);
    });

    // Click handler (only if not dragging)
    card.addEventListener('click', onClick);
  },

  collectGroundItem(card, item, opts = {}) {
    if (item.category === 'location' && item.unlockLocationKey) {
      // Unlock location
      const targetKey = item.unlockLocationKey;
      const forestOption = document.querySelector(`#locationMenu [data-key="${targetKey}"]`);
      if (forestOption && forestOption.style.display === 'none') forestOption.style.display = '';
      const status = document.getElementById('status');
      if (status) status.textContent = `You discovered ${item.name}!`;
      AudioManager.playClick();
      this.gainXP(item.xp || 10);
    } else if (item.category === 'treasure') {
      // Treasure chest: drop some coins and a random item
      const coins = 5 + Math.floor(Math.random() * 20);
      for (let i = 0; i < coins; i++) {
        Inventory.addItem('Small Coin');
      }
      const extras = ['Sea Shell', 'Driftwood', 'Seaweed'];
      const extra = extras[Math.floor(Math.random()*extras.length)];
      Inventory.addItem(extra);
      this.animateToInventory(card);
      AudioManager.playGoldPickup();
      this.spawnXpFloat(card, `+${item.xp || 12} XP`);
      this.gainXP(item.xp || 12);
    } else {
      // Regular items (discovered or dropped)
      const qty = item.count || 1;
      for (let i = 0; i < qty; i++) {
        Inventory.addItem(item.name, item.type || null);
      }
      this.animateToInventory(card);
      AudioManager.playPickupFor({ name: item.name, category: item.category || 'ground', subtype: item.subtype });
      
      // Only give XP for discovered items, not dropped items
      if (!opts.noXp && item.category && item.category !== 'ground') {
        gameState.foraging.xp += (item.xp || 5) * qty;
        if (gameState.foraging.xp >= gameState.foraging.xpToNext) {
          gameState.foraging.xp -= gameState.foraging.xpToNext;
          gameState.foraging.level++;
          gameState.foraging.xpToNext = Math.floor(gameState.foraging.xpToNext * 1.2);
        }
        this.spawnXpFloat(card, `+${(item.xp || 5) * qty} XP`);
      }
    }

    // Remove from ground
    card.remove();
    
    // Handle discovery tracking for found items
    if (item.category && item.category !== 'ground') {
      this.handleDiscovery(item);
    }
    
    // Auto-save
    SaveManager.debouncedSave();
    
    // Continue exploration if was exploring
    if (gameState.isExploring) {
      this.continue();
    }
  },

  handleDiscovery(discovery) {
    const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
    gameState.discoveries.unshift({ ...discovery, timestamp: now });
    if (gameState.discoveries.length > 10) gameState.discoveries.pop();
    
    // Auto-save when discoveries change
    try {
      import('../../systems/SaveManager.js').then(({ SaveManager }) => {
        SaveManager.debouncedSave();
      });
    } catch {}
    const status = document.getElementById('status');
    if (discovery.type === 'resource') { status && (status.textContent = `Found ${discovery.name}!`); }
    this.gainXP(discovery.xp);

    // Very small chance to discover Forest after level 5
    if (gameState.exploration.level >= 5) {
      const unlockRoll = Math.random(); // 0..1
      if (unlockRoll < 0.01) { // 1% per successful interval
        const forestOption = document.querySelector('#locationMenu [data-key="forest"]');
        if (forestOption && forestOption.style.display === 'none') {
          forestOption.style.display = '';
          const status = document.getElementById('status');
          if (status) status.textContent = 'You discovered Whispering Woods!';
        }
      }
    }
  },

  gainXP(amount) {
    gameState.exploration.xp += amount;
    while (gameState.exploration.xp >= gameState.exploration.xpToNext) {
      gameState.exploration.xp -= gameState.exploration.xpToNext;
      gameState.exploration.level++;
      gameState.exploration.xpToNext = Math.floor(gameState.exploration.xpToNext * 1.25);
    }
    const badge = document.querySelector('[data-skill-level="exploration"]');
    if (badge) badge.textContent = gameState.exploration.level;
    const card = document.querySelector('.skill-card[data-skill="exploration"]');
    if (card) card.style.setProperty('--progress-pct', `${Math.min(100, (gameState.exploration.xp / gameState.exploration.xpToNext) * 100)}%`);
  }
};


