import { gameState, Locations } from '../../state/gameState.js';
import { Inventory } from '../inventory/index.js';
import { AudioManager } from '../../systems/AudioManager.js';
import { IdleManager, FishingJob } from '../../systems/IdleManager.js';
import { Fishing } from '../fishing/index.js';
import { ZONES_BY_LOCATION } from '../../data/zones.js';

/**
 * Permanent Skilling Zones per location.
 * Minimal v1: Level 1 Fishing Zone at beach requiring a Fishing Pole.
 */
export const SkillingZones = {
  currentFishingJobId: null,
  getFishIconId(name) {
    const map = {
      'Minnow': 'fish-minnow',
      'Trout': 'fish-trout',
      'Bass': 'fish-bass',
      'Salmon': 'fish-salmon',
      'Golden Carp': 'fish-carp',
    };
    return map[name] || 'fish-minnow';
  },

  // Deprecated inline render; zones now live in the Zones panel
  renderFor() {},

  // Render all zones into the fixed panel list from config
  renderAllInPanel() {
    const list = document.getElementById('zones-list');
    if (!list) return;
    list.innerHTML = '';
    const zones = ZONES_BY_LOCATION.beach || [];
    zones.forEach((def) => {
      list.appendChild(this.createZoneCard(def));
    });
  },

  createZoneCard(def) {
    const zone = document.createElement('div');
    const theme = def.themeClass || '';
    const disabled = !!def.disabled;
    zone.className = `zone-card ${theme}${disabled ? ' locked' : ''}`.trim();
    zone.innerHTML = `
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#${def.icon || 'icon-location'}"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">${def.name}</div>
        <div class="zone-req">${def.toolRequired ? `Requires: <strong>${def.toolRequired.name}</strong>` : ''}</div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" ${disabled ? 'disabled' : ''} aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>${def.actionLabel || 'Start'}</button>
          <div class="zone-status" aria-live="polite">${disabled ? 'N/A' : 'Idle'}</div>
          ${def.toolRequired ? '<div class="tool-indicator">Tool</div>' : ''}
        </div>
      </div>
      ${def.system === 'fishing' ? '<div class="zone-popover" role="dialog" aria-hidden="true"></div>' : ''}
    `;
    const action = zone.querySelector('.zone-action');
    if (action && !disabled) {
      action.addEventListener('click', () => {
        if (def.system === 'fishing') this.toggleFishing(zone);
      });
    }
    if (def.toolRequired) {
      const ti = zone.querySelector('.tool-indicator');
      const has = this.hasItem(def.toolRequired.name);
      if (ti) { ti.textContent = has ? '✓' : '✗'; ti.classList.toggle('missing', !has); ti.classList.toggle('ok', !!has); }
    }
    if (def.system === 'fishing') {
      // Ensure UI reflects current active state when panel is reopened
      this.updateZoneState(zone, this.isFishingActive());
      this.attachFishingPopover(zone);
    }
    return zone;
  },

  attachFishingPopover(zone) {
    const action = zone.querySelector('.zone-action');
    const pop = zone.querySelector('.zone-popover');

    // Portal container for rendering above all UI (avoids clipping/overflow issues)
    const ensurePortal = () => {
      let portal = document.getElementById('zone-popover-portal');
      if (!portal) {
        portal = document.createElement('div');
        portal.id = 'zone-popover-portal';
        portal.style.position = 'fixed';
        portal.style.zIndex = '10000';
        portal.style.pointerEvents = 'none';
        portal.style.minWidth = '180px';
        document.body.appendChild(portal);
      }
      portal.className = 'zone-popover';
      portal.setAttribute('role', 'dialog');
      return portal;
    };

    const buildContentHtml = () => {
      const allFish = (Fishing.fishTypes || []).slice();
      const discovered = JSON.parse(localStorage.getItem('fish_discovered') || '[]');
      const fish = allFish.filter(f => discovered.includes(f.name));
      const rows = fish.map((f) => {
        const iconId = this.getFishIconId(f.name);
        const req = `Lvl ${f.minLevel || 1}`;
        const iconStyle = f.color ? ` style=\"color:${f.color}\"` : '';
        return `
          <div class="catch-row">
            <div class="catch-icon"${iconStyle}><svg><use href="#${iconId}"/></svg></div>
            <div class="catch-name">${f.name}</div>
            <div class="catch-req">${req}</div>
          </div>
        `;
      }).join('');
      return fish.length > 0 
        ? `<div class="pop-title">Discovered Fish</div>${rows}`
        : `<div class="pop-title">Discovered Fish</div><div class="catch-row"><div class="catch-name">No fish discovered yet</div></div>`;
    };

    const showPortalAt = (clientX, clientY) => {
      const portal = ensurePortal();
      portal.innerHTML = buildContentHtml();
      const margin = 10;
      const maxWidth = 260;
      const left = Math.min(Math.max(8, clientX + margin), window.innerWidth - maxWidth - 8);
      const top = Math.min(clientY + margin, window.innerHeight - 8);
      portal.style.left = `${left}px`;
      portal.style.top = `${top}px`;
      portal.style.display = 'block';
      portal.setAttribute('aria-hidden', 'false');
    };
    const hidePortal = () => {
      const portal = document.getElementById('zone-popover-portal');
      if (portal) { portal.style.display = 'none'; portal.setAttribute('aria-hidden', 'true'); }
      if (pop) pop.setAttribute('aria-hidden', 'true');
    };

    if (action) {
      action.addEventListener('mouseenter', (e) => {
        const ev = e.touches ? e.touches[0] : e;
        showPortalAt(ev.clientX, ev.clientY);
      });
      action.addEventListener('mousemove', (e) => {
        const ev = e.touches ? e.touches[0] : e;
        showPortalAt(ev.clientX, ev.clientY);
      });
      action.addEventListener('mouseleave', hidePortal);
      action.addEventListener('touchstart', (e) => {
        const ev = e.touches ? e.touches[0] : e;
        showPortalAt(ev.clientX, ev.clientY);
      }, { passive: true });
      action.addEventListener('touchend', hidePortal, { passive: true });
    }
  },

  createComingSoonCard(index) {
    const zone = document.createElement('div');
    const themes = ['theme-mining', 'theme-forest', 'theme-beach', 'theme-forest'];
    zone.className = `zone-card locked ${themes[index % themes.length]}`;
    zone.innerHTML = `
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-location"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Coming soon</div>
        <div class="zone-req">New idle activity</div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" disabled>Locked</button>
          <div class="zone-status" aria-live="polite">N/A</div>
        </div>
      </div>
    `;
    return zone;
  },

  // Example Level 1 Mining Area (theme-mining)
  createMiningZoneCard() {
    const zone = document.createElement('div');
    zone.className = 'zone-card theme-mining';
    zone.innerHTML = `
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-location"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Level 1 Mining Area</div>
        <div class="zone-req">Requires: <strong>Pickaxe</strong></div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>Mine</button>
          <div class="zone-status" aria-live="polite">Idle</div>
          <div class="tool-indicator">✗</div>
        </div>
      </div>
    `;
    // No behavior yet (coming soon), just UI theme
    return zone;
  },

  hasItem(name) {
    try {
      return Array.isArray(gameState?.inventory) && gameState.inventory.some((it) => it && it.name === name && (it.count == null || it.count > 0));
    } catch {
      return false;
    }
  },

  isFishingActive() {
    return IdleManager.hasActiveOfKind('fishing');
  },

  toggleFishing(zoneEl) {
    // Disallow fishing while exploring is active
    try {
      if (gameState.isExploring) {
        const status = document.getElementById('status');
        if (status) status.textContent = 'Finish exploring before starting to fish.';
        AudioManager.playCancel?.();
        return;
      }
    } catch {}

    const active = this.isFishingActive();
    if (active) {
      IdleManager.cancelAllOfKind('fishing');
      this.currentFishingJobId = null;
      this.updateZoneState(zoneEl, false);
      AudioManager.playClick();
      return;
    }
    if (!this.hasItem('Fishing Pole')) {
      // brief visual nudge; rely on requirement text for messaging
      try { zoneEl.classList.add('require-missing'); setTimeout(() => zoneEl.classList.remove('require-missing'), 500); } catch {}
      AudioManager.playCancel?.();
      return;
    }

    // Start a long-running fishing job
    const allFishTypes = Fishing.fishTypes || [];
    const playerLevel = gameState.fishing?.level || 1;
    // Filter fish types to only include those the player has the level for
    const fishTypes = allFishTypes.filter(fish => (fish.minLevel || 1) <= playerLevel);
    
    // Ensure at least the Minnow is available for new players
    if (fishTypes.length === 0 && playerLevel >= 1) {
      const minnow = allFishTypes.find(fish => fish.name === 'Minnow');
      if (minnow) fishTypes.push(minnow);
    }
    
    const job = new FishingJob({ remaining: 1000000000, fishTypes, playerLevel });
    job.on('catch', (fish) => {
      try { Inventory.addItem(fish.name); } catch {}
      try { Fishing.gainXP(fish.xp || 1); } catch {}
      try { AudioManager.playPickupFor({ name: fish.name, category: 'item', subtype: 'fish' }); } catch {}
      // Visual feedback: fly icon to inventory and show XP float
      try {
        const iconId = this.getFishIconId(fish.name);
        this.animateCatchToInventory(zoneEl, iconId);
        this.spawnFloatAtZone(zoneEl, `Caught ${fish.name} (+${fish.xp || 1} XP)`);
      } catch {}
    });
    IdleManager.addJob(job);
    this.currentFishingJobId = job.id;
    this.updateZoneState(zoneEl, true);
    AudioManager.playClick();
  },

  animateCatchToInventory(zoneEl, iconId) {
    try {
      // Skip animation if zones panel is hidden or the zone is not visible
      const zonesPanel = document.getElementById('panel-zones');
      if (zonesPanel && zonesPanel.style.display === 'none') return;
      if (!zoneEl || zoneEl.getClientRects().length === 0) return;

      const startEl = zoneEl.querySelector('.zone-icon svg') || zoneEl.querySelector('.zone-action');
      const dockBtn = document.getElementById('toggleInventory');
      const invGrid = document.getElementById('inv-grid');
      if (!startEl || (!dockBtn && !invGrid)) return;
      const rectFrom = startEl.getBoundingClientRect();
      const rectTo = (dockBtn || invGrid).getBoundingClientRect();
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${iconId}`);
      ghost.appendChild(use);
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

  spawnFloatAtZone(zoneEl, text) {
    try {
      const anchor = zoneEl.querySelector('.zone-action') || zoneEl;
      const rect = anchor.getBoundingClientRect();
      const tag = document.createElement('div');
      tag.className = 'xp-float';
      tag.textContent = text;
      tag.style.left = `${rect.left + rect.width / 2 - 40}px`;
      tag.style.top = `${rect.top - 6}px`;
      document.body.appendChild(tag);
      setTimeout(() => tag.remove(), 1000);
    } catch {}
  },

  updateZoneState(zoneEl, active) {
    if (!zoneEl) return;
    zoneEl.classList.toggle('active', !!active);
    const btn = zoneEl.querySelector('.zone-action');
    const status = zoneEl.querySelector('.zone-status');
    if (btn) { btn.setAttribute('aria-pressed', String(!!active)); }
    if (status) status.textContent = active ? 'Fishing...' : 'Idle';
  },

  renderBeachFishing(container) {
    const zone = document.createElement('div');
    zone.className = 'zone-card fishing-zone theme-beach';
    zone.innerHTML = `
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-fish-spot"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Passive coastal fishing</div>
        <div class="zone-req">Requires: <strong>Fishing Pole</strong></div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>Fish</button>
          <div class="zone-status" aria-live="polite">Idle</div>
        </div>
      </div>
      <div class="zone-popover" role="dialog" aria-hidden="true"></div>
    `;
    const action = zone.querySelector('.zone-action');
    action?.addEventListener('click', () => this.toggleFishing(zone));
    // Dropdown popover for possible catches
    const pop = zone.querySelector('.zone-popover');
    const buildPopover = () => {
      if (!pop) return;
      const allFish = (Fishing.fishTypes || []).slice();
      const playerLevel = (window?.gameState?.fishing?.level) || 1;
      const discovered = JSON.parse(localStorage.getItem('fish_discovered') || '[]');
      // Only show fish that have been discovered
      const fish = allFish.filter(f => discovered.includes(f.name));
      const rows = fish.map((f) => {
        const iconId = this.getFishIconId(f.name);
        const req = `Lvl ${f.minLevel || 1}`;
        const iconStyle = f.color ? ` style=\"color:${f.color}\"` : '';
        return `
          <div class="catch-row">
            <div class="catch-icon"${iconStyle}><svg><use href="#${iconId}"/></svg></div>
            <div class="catch-name">${f.name}</div>
            <div class="catch-req">${req}</div>
          </div>
        `;
      }).join('');
      const content = fish.length > 0 
        ? `<div class="pop-title">Discovered Fish</div>${rows}`
        : `<div class="pop-title">Discovered Fish</div><div class="catch-row"><div class="catch-name">No fish discovered yet</div></div>`;
      pop.innerHTML = content;
    };
    const togglePopover = (open) => {
      if (!pop) return;
      zone.classList.toggle('open', !!open);
      pop.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) buildPopover();
    };
    if (action) {
      action.addEventListener('mouseenter', () => togglePopover(true));
      action.addEventListener('mouseleave', () => togglePopover(false));
    }
    // Initial state reflect current job
    this.updateZoneState(zone, this.isFishingActive());
    if (!this.hasItem('Fishing Pole')) zone.classList.add('missing');
    container.appendChild(zone);

    // Make draggable within panel
    const bounds = container.getBoundingClientRect();
    let dragging = false; let startX = 0; let startY = 0; let ox = 16; let oy = 16;
    let xpct = null; let ypct = null; // 0..1 positional percentages
    const setPos = (x, y) => { zone.style.left = `${Math.round(x)}px`; zone.style.top = `${Math.round(y)}px`; };
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const applyPctPosition = () => {
      const b = container.getBoundingClientRect();
      const maxX = Math.max(8, b.width - zone.offsetWidth - 8);
      const maxY = Math.max(8, b.height - zone.offsetHeight - 8);
      const nx = (xpct != null ? xpct : 0) * maxX + 8;
      const ny = (ypct != null ? ypct : 0) * maxY + 8;
      setPos(nx, ny);
    };
    // Restore last pos per location if stored (prefer percentages; convert legacy px to pct)
    try {
      const key = `zone_pos_${Locations.current.key}_fishing`;
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved.xpct === 'number' && typeof saved.ypct === 'number') {
        xpct = clamp01(saved.xpct);
        ypct = clamp01(saved.ypct);
        applyPctPosition();
      } else if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        const maxX = Math.max(1, bounds.width - zone.offsetWidth - 8);
        const maxY = Math.max(1, bounds.height - zone.offsetHeight - 8);
        xpct = clamp01((saved.x - 8) / maxX);
        ypct = clamp01((saved.y - 8) / maxY);
        applyPctPosition();
        try { 
          localStorage.setItem(key, JSON.stringify({ xpct, ypct })); 
          
          // Auto-save when zone positions change
          try {
            import('../../systems/SaveManager.js').then(({ SaveManager }) => {
              SaveManager.debouncedSave();
            });
          } catch {}
        } catch {}
      } else {
        setPos(ox, oy);
      }
    } catch { setPos(ox, oy); }
    const onDown = (ev) => {
      const p = ev.touches ? ev.touches[0] : ev;
      const r = zone.getBoundingClientRect();
      dragging = true; startX = p.clientX - r.left; startY = p.clientY - r.top;
      zone.classList.add('dragging');
      ev.preventDefault?.(); ev.stopPropagation?.();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const p = ev.touches ? ev.touches[0] : ev;
      const b = container.getBoundingClientRect();
      let nx = p.clientX - b.left - startX;
      let ny = p.clientY - b.top - startY;
      const maxX = b.width - zone.offsetWidth - 8;
      const maxY = b.height - zone.offsetHeight - 8;
      nx = Math.max(8, Math.min(maxX, nx));
      ny = Math.max(8, Math.min(maxY, ny));
      setPos(nx, ny);
      ev.preventDefault?.(); ev.stopPropagation?.();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false; zone.classList.remove('dragging');
      try {
        const key = `zone_pos_${Locations.current.key}_fishing`;
        const b = container.getBoundingClientRect();
        const r = zone.getBoundingClientRect();
        const maxX = Math.max(1, b.width - zone.offsetWidth - 8);
        const maxY = Math.max(1, b.height - zone.offsetHeight - 8);
        xpct = clamp01((r.left - b.left - 8) / maxX);
        ypct = clamp01((r.top - b.top - 8) / maxY);
        localStorage.setItem(key, JSON.stringify({ xpct, ypct }));
        
        // Auto-save when zone positions change
        try {
          import('../../systems/SaveManager.js').then(({ SaveManager }) => {
            SaveManager.debouncedSave();
          });
        } catch {}
      } catch {}
    };
    zone.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    zone.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp, { passive: true });
    // Re-apply percent position on window resize so the zone stays proportional
    const onResize = () => { if (xpct != null && ypct != null) applyPctPosition(); };
    window.addEventListener('resize', onResize);
  },
};


