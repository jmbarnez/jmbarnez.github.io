import { $$ } from '../../core/dom.js';
import { gameState } from '../../state/gameState.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { debounce, throttle, batchDomUpdates, perfMonitor } from '../../utils/performance.js';

let inventoryRef = null;
export function setInventory(inv) { inventoryRef = inv; }
// Expose minimal API for right-click equip fallback
if (!window.__equipmentApi) window.__equipmentApi = {};
window.__equipmentApi.equipItem = (item, fromIndex, cursorPos) => Equipment.equipItem(item, fromIndex, cursorPos);

export const Equipment = {
  slotMapping: {
    helmet: ['helmet'], chest: ['chest'], gloves: ['gloves'], pants: ['pants'], shoes: ['shoes'], ring: ['ring1', 'ring2'], amulet: ['amulet']
  },
  currentHighlightSource: null,

  init() { 
    this.setupSlots(); 
    this.updateUI(); 
    // Bind debounced methods to this context
    this.debouncedUpdateUI = debounce(() => this.updateUI(), 16);
    this.throttledClearHighlights = throttle(() => this.clearHighlights(), 16);
  },

  setupSlots() {
    $$('.equipment-slot').forEach(slotEl => {
      slotEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        slotEl.classList.add('drag-over');
        const fromItem = gameState.inventory[inventoryRef?.dragFromIndex ?? null];
        const can = fromItem && this.canEquip(fromItem.type, slotEl.dataset.slot);
        slotEl.classList.toggle('slot-invalid', !can);
        const occupied = !!gameState.equipment[slotEl.dataset.slot];
        slotEl.classList.toggle('slot-occupied', !!can && occupied);
      });
      slotEl.addEventListener('dragleave', () => slotEl.classList.remove('drag-over', 'slot-invalid', 'slot-occupied'));
      slotEl.addEventListener('drop', (e) => {
        e.preventDefault();
        slotEl.classList.remove('drag-over', 'slot-invalid', 'slot-occupied');
        const slotType = slotEl.dataset.slot;
        const fromIndex = inventoryRef?.dragFromIndex;
        const item = gameState.inventory[fromIndex];
        if (item && this.canEquip(item.type, slotType)) {
          const cursorX = e.clientX;
          const cursorY = e.clientY;
          this.equipItem(item, fromIndex, { cursorX, cursorY });
        }
        if (inventoryRef) inventoryRef.dragFromIndex = null;
      });
    });
  },

  canEquip(itemType, slotType) { return itemType === slotType || (itemType === 'ring' && (slotType === 'ring1' || slotType === 'ring2')); },

  equipItem(item, fromIndex, cursorPos = null) {
    let targetSlot = item.type;
    if (item.type === 'ring') targetSlot = gameState.equipment.ring1 ? 'ring2' : 'ring1';
    if (gameState.equipment[targetSlot]) {
      const unequippedItem = gameState.equipment[targetSlot];
      gameState.inventory.push(unequippedItem);
    }
    gameState.equipment[targetSlot] = item;
    gameState.inventory.splice(fromIndex, 1);
    if (inventoryRef) inventoryRef.debouncedRender();
    this.debouncedUpdateUI();
    AudioManager.playEquip();
    SaveManager.debouncedSave(); // Auto-save after equipping item
    
    // Show "Equipped!" notification at cursor position
    if (cursorPos && cursorPos.cursorX !== undefined && cursorPos.cursorY !== undefined) {
      Tooltip.showNotification(cursorPos.cursorX, cursorPos.cursorY, 'Equipped!');
    }
  },

  unequipItem(slotType) {
    const item = gameState.equipment[slotType];
    if (!item) return;
    gameState.inventory.push(item);
    gameState.equipment[slotType] = null;
    if (inventoryRef) inventoryRef.debouncedRender();
    this.debouncedUpdateUI();
    SaveManager.debouncedSave(); // Auto-save after unequipping item
  },

  updateUI() {
    perfMonitor.time('equipment-ui-update');
    
    batchDomUpdates([
      () => {
        $$('.equipment-slot').forEach(slotEl => {
          const slotType = slotEl.dataset.slot;
          const slotItem = slotEl.querySelector('.slot-item');
          const item = gameState.equipment[slotType];
          
          if (item && slotItem) {
            this.renderEquippedItem(slotItem, item, slotType);
          } else if (slotItem) {
            this.renderEmptySlot(slotItem);
          }
        });
      }
    ]);
    
    perfMonitor.timeEnd('equipment-ui-update');
  },

  renderEquippedItem(slotItem, item, slotType) {
    const icon = inventoryRef ? inventoryRef.createItemIcon(item) : null;
    if (!icon) { 
      slotItem.innerHTML = ''; 
      slotItem.classList.add('empty'); 
      return; 
    }
    
    icon.setAttribute('width', '20');
    icon.setAttribute('height', '20');
    slotItem.innerHTML = '';
    slotItem.appendChild(icon);
    slotItem.classList.remove('empty');
    
    this.setupItemEventListeners(slotItem, item, slotType);
  },

  renderEmptySlot(slotItem) {
    slotItem.innerHTML = '';
    slotItem.classList.add('empty');
    const newSlotItem = slotItem.cloneNode(true);
    slotItem.parentNode?.replaceChild(newSlotItem, slotItem);
  },

  setupItemEventListeners(slotItem, item, slotType) {
    slotItem.addEventListener('mouseenter', (e) => Tooltip.show(e, item.name));
    slotItem.addEventListener('mouseleave', () => Tooltip.hide());
    slotItem.addEventListener('mousemove', (e) => Tooltip.move(e));
    slotItem.addEventListener('mousedown', () => { try { Tooltip.hide(); } catch {} });
    slotItem.draggable = true;
    slotItem.addEventListener('dragstart', () => {
      if (inventoryRef) inventoryRef.dragFromEquipment = slotType;
      slotItem.classList.add('dragging');
      try { Tooltip.hide(); } catch {}
      AudioManager.playPickup();
    });
    slotItem.addEventListener('dragend', () => {
      slotItem.classList.remove('dragging');
      if (inventoryRef) inventoryRef.dragFromEquipment = null;
    });
    slotItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.unequipItem(slotType);
      AudioManager.playClick();
    });
  },

  // Add debounced update method
  debouncedUpdateUI: debounce(function() { this.updateUI(); }, 16), // 60fps limit

  highlightSlots(itemType, source = 'hover') {
    this.currentHighlightSource = source;
    this.throttledClearHighlights();
    const slots = this.slotMapping[itemType];
    if (!slots) return;
    
    batchDomUpdates([
      () => {
        slots.forEach(slotType => {
          const slotEl = document.querySelector(`[data-slot="${slotType}"]`);
          if (slotEl) slotEl.classList.add('compatible-highlight');
        });
      }
    ]);
  },

  clearHighlights(source = 'hover') {
    if (this.currentHighlightSource === source || source === 'force' || !this.currentHighlightSource) {
      batchDomUpdates([
        () => {
          $$('.equipment-slot').forEach(slot => slot.classList.remove('compatible-highlight'));
        }
      ]);
      this.currentHighlightSource = null;
    }
  }
};


