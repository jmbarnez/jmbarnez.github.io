import { $, $$ } from '../core/dom.js';
import { gameState, Locations } from '../state/gameState.js';
import { AudioManager } from '../systems/AudioManager.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { Inventory } from '../features/inventory/index.js';
import { Fishing } from '../features/fishing/index.js';
import { SkillingZones } from '../features/zones/index.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Exploration } from '../features/exploration/index.js';
import { ChatClient } from '../systems/ChatClient.js';

// Helper function to get the correct API base URL
const getApiBaseUrl = () => {
  const currentHost = window.location.hostname;
  
  // For local development, always use port 8889 (Netlify dev server)
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    return `${window.location.protocol}//${currentHost}:8889`;
  } else if (currentHost.includes('ngrok-free.app') || currentHost.includes('ngrok.app')) {
    return window.location.origin;
  } else {
    return window.location.origin;
  }
};

// Helper to get auth token for API calls
const getAuthToken = () => (window).__authToken || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';

// Utility to prevent duplicate button presses
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Utility to prevent rapid button clicks
const preventDuplicateClicks = (button, delay = 300) => {
  if (!button) return;
  button.disabled = true;
  setTimeout(() => {
    button.disabled = false;
  }, delay);
};

export const UI = {
  elements: {},

  init() {
    // Initialize particle system
    ParticleManager.init();
    
    this.elements = {
      navTabs: $$('.nav-tab'),
      contentPanels: $$('.content-panel'),
      hpBar: $('hp-bar'),
      staminaBar: $('stamina-bar'),
      manaBar: $('mana-bar'),
      fishingLevel: $('fishing-level-display'),
      expDisplay: $('exp-display'),
      expNeeded: $('exp-needed-display'),
      explorationProgress: $('exploration-progress'),
      invGrid: $('inv-grid'),
      fishBtn: $('fishBtn'),
      exploreBtn: $('exploreBtn'),
      explorationStatus: $('exploration-status'),
      gameLog: $('game-log'),
      status: $('status'),
      clock: $('clock'),
      saveBtn: $('saveBtn'),
      exitBtn: $('exitBtn'),
      audioToggleBtn: $('audioToggleBtn'),
      ambienceVolume: $('ambienceVolume'),
      sfxVolume: $('sfxVolume'),
      chatColorPickerPanel: $('chatColorPickerPanel'),
      settingsBtn: $('settingsBtn'),
      settingsPanel: $('settingsPanel'),
    };
    this.setupNavigation();
    this.setupButtons();
    this.loadTheme();
    this.updateAudioToggleUI?.();
    // Save slots removed for account-bound saves
    this.updateAll();
    this.initMarketTabs();
    this.initDesktopSocialButtons();
    // Initialize market sync properties
    this.serverMarketListings = [];
    this._marketSyncInitialized = false;
    // Ensure initial button state reflects not-exploring
    const exploreBtn = this.elements.exploreBtn;
    if (exploreBtn) { exploreBtn.classList.remove('exploring', 'active'); exploreBtn.setAttribute('aria-pressed', 'false'); }
    const lbl = document.getElementById('exploreBtnLabel');
    if (lbl) lbl.textContent = 'Explore';
    try { Exploration.attachGroundDropHandlers(); } catch {}

    // Robustly handle List Item button via delegation in case of dynamic DOM
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#listItemBtn');
      if (btn) {
        e.preventDefault();
        if (btn.disabled) return; // Prevent multiple clicks
        preventDuplicateClicks(btn, 500);
        this.listItemForSale();
      }
    });

    // Global UI SFX handlers: play click and hover sounds for interactive controls
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, [role="button"]');
      if (!btn) return;
      if (btn.disabled) return;
      if (btn.dataset && btn.dataset.noSfx === 'true') return; // opt-out
      if (btn.classList && btn.classList.contains('no-sfx')) return;
      try { AudioManager.playButtonClick(); } catch {}
    });

    document.addEventListener('pointerover', (e) => {
      const btn = e.target.closest('button, [role="button"]');
      if (!btn) return;
      if (btn.disabled) return;
      if (btn.dataset && btn.dataset.noSfx === 'true') return; // opt-out
      if (btn.classList && btn.classList.contains('no-sfx')) return;
      try { AudioManager.playButtonHover(); } catch {}
    }, { capture: true });
  },

  showLogin() {
    const existing = document.getElementById('authModal');
    if (existing) { 
      existing.hidden = false; 
      return; 
    }
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-dialog" role="dialog" aria-modal="true">
        <h2>Sign In</h2>
        
        <div class="auth-row"><input id="authUser" type="text" placeholder="Username" autocomplete="username"/></div>
        <div class="auth-row"><input id="authPass" type="password" placeholder="Password" autocomplete="current-password"/></div>
        <div class="auth-actions">
          <button id="authLogin" class="primary-btn">Login</button>
          <button id="authRegister" class="primary-btn">Register</button>
          <button id="authClose" class="header-btn">Close</button>
        </div>
        <div id="authStatus" class="auth-status"></div>
      </div>`;
    document.body.appendChild(modal);
    
    
    const status = modal.querySelector('#authStatus');
    const setStatus = (t) => { if (status) status.textContent = t; };
    const getCreds = () => ({ username: modal.querySelector('#authUser')?.value?.trim(), password: modal.querySelector('#authPass')?.value || '' });
    const authFetch = async (path, body) => {
      const url = `${getApiBaseUrl()}${path}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.json();
    };
    const onLogin = async () => {
      const c = getCreds(); if (!c.username || !c.password) return setStatus('Enter username and password');
      setStatus('Signing in...');
      try {
        const out = await authFetch('/api/login', c);
        if (out?.token) { 
          localStorage.setItem('authToken', out.token); 
          localStorage.setItem('playerName', c.username);
          // Clear any previous chat player id when logging in as a different user
          try { localStorage.removeItem('chatPlayerId'); } catch {}
          setStatus('Signed in'); 
          modal.hidden = true; 
        }
        else setStatus(out?.error || 'Login failed');
      } catch { setStatus('Login failed'); }
    };
    const onRegister = async () => {
      const c = getCreds(); if (!c.username || !c.password) return setStatus('Enter username and password');
      setStatus('Registering...');
      try {
        const out = await authFetch('/api/register', c);
        if (out?.token) { 
          localStorage.setItem('authToken', out.token); 
          localStorage.setItem('playerName', c.username);
          setStatus('Registered and signed in'); 
          modal.hidden = true; 
        }
        else setStatus(out?.error || 'Registration failed');
      } catch { setStatus('Registration failed'); }
    };
    modal.querySelector('#authLogin')?.addEventListener('click', onLogin);
    modal.querySelector('#authRegister')?.addEventListener('click', onRegister);
    modal.querySelector('#authClose')?.addEventListener('click', () => { modal.hidden = true; });
  },


  

  setupSaveSlots() {
    const container = document.getElementById('save-slots');
    if (!container) return;
    const refresh = () => {
      const infos = SaveManager.listSlots();
      infos.forEach((info) => {
        const slotEl = container.querySelector(`.save-slot[data-slot="${info.key}"]`);
        if (!slotEl) return;
        const actions = slotEl.querySelector('.slot-actions');
        const meta = slotEl.querySelector('.slot-meta');
        if (info.hasData) {
          slotEl.classList.remove('empty');
          if (meta) meta.textContent = `Saved: ${new Date(info.savedAt || Date.now()).toLocaleString()}`;
          actions.innerHTML = `
            <button class="primary-btn save-btn" data-act="save">Save</button>
            <button class="primary-btn load-btn" data-act="load">Load</button>
            <button class="primary-btn delete-btn" data-act="delete">Delete</button>
          `;
        } else {
          slotEl.classList.add('empty');
          if (meta) meta.textContent = '';
          actions.innerHTML = `<button class="primary-btn new-btn" data-act="new" style="width:100%">New Game</button>`;
        }
      });
    };
    refresh();
    // Event delegation for dynamic buttons
    container.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('button[data-act]');
      if (!btn) return;
      const slotEl = btn.closest('.save-slot');
      if (!slotEl) return;
      const slotKey = slotEl.getAttribute('data-slot');
      const act = btn.getAttribute('data-act');
      if (act === 'save') {
        SaveManager.saveToSlot(slotKey);
        this.setStatus(`Saved to ${slotKey}`);
        refresh();
      } else if (act === 'load') {
        const ok = SaveManager.loadFromSlot(slotKey);
        if (!ok) this.setStatus('No save data to load');
      } else if (act === 'delete') {
        if (confirm(`Delete ${slotKey}?`)) {
          SaveManager.deleteSlot(slotKey);
          this.setStatus(`Deleted ${slotKey}`);
          refresh();
        }
      } else if (act === 'new') {
        if (confirm(`Start new game in ${slotKey}?`)) {
          SaveManager.newGame(slotKey);
        }
      }
    });
  },




  setupNavigation() {
    this.elements.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        this.switchView(view);
        AudioManager.playButtonClick();
      });
      tab.addEventListener('mouseenter', () => AudioManager.playButtonHover());
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { AudioManager.playButtonClick(); }
      });
    });
    const badgeNameEl = document.getElementById('locationName');
    const badgeEl = document.getElementById('locationBadge');
    const menu = document.getElementById('locationMenu');
    const iconEl = document.getElementById('locationIcon');
    const bgEl = document.getElementById('locationBackground');
    const caretEl = badgeEl?.querySelector('.caret');
    const rootStyle = document.documentElement.style;

    if (badgeNameEl) badgeNameEl.textContent = Locations.current.name;
    if (iconEl) iconEl.textContent = Locations.current.icon;
    if (badgeEl) badgeEl.className = `location-badge ${Locations.current.key}`;
    // Apply location background to active panel instead of inline bg element
    this.applyPanelBackground();

    const toggleMenu = (expand) => {
      if (!badgeEl || !menu) return;
      badgeEl.setAttribute('aria-expanded', expand ? 'true' : 'false');
      menu.classList.toggle('open', !!expand);
    };

    const openExplore = () => {
      // World == exploration; no distinct view to switch
      AudioManager.playClick();
    };

    if (badgeEl) {
      badgeEl.addEventListener('click', (e) => {
        const target = e.target;
        if (target && target.classList && target.classList.contains('caret')) {
          const expanded = badgeEl.getAttribute('aria-expanded') === 'true';
          toggleMenu(!expanded);
          e.stopPropagation();
          return;
        }
        toggleMenu(false);
        openExplore();
      });
    }
    if (caretEl) {
      caretEl.addEventListener('click', (e) => {
        const expanded = badgeEl.getAttribute('aria-expanded') === 'true';
        toggleMenu(!expanded);
        e.stopPropagation();
      });
    }
    document.addEventListener('click', (e) => {
      if (!badgeEl || !menu) return;
      if (!badgeEl.contains(e.target) && !menu.contains(e.target)) toggleMenu(false);
    });
    if (badgeEl) {
      badgeEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          toggleMenu(true);
          e.preventDefault();
        } else if (e.key === 'Enter' || e.key === ' ') {
          toggleMenu(false);
          openExplore();
          e.preventDefault();
        }
      });
    }

    if (menu) {
      menu.querySelectorAll('li[role="option"]').forEach((item) => {
        item.addEventListener('click', () => {
          const key = item.dataset.key;
          const loc = Locations.all[key];
          if (!loc) return;
          Locations.current = { key: loc.key, name: loc.name, icon: loc.icon };
          if (badgeNameEl) badgeNameEl.textContent = loc.name;
          if (iconEl) iconEl.textContent = loc.icon;
          if (badgeEl) badgeEl.className = `location-badge ${loc.badgeClass}`;
          this.applyPanelBackground();
          if (loc.key === 'beach') rootStyle.setProperty('--focus-glow-color', '#5aa9d6');
          else if (loc.key === 'forest') rootStyle.setProperty('--focus-glow-color', '#406b40');
          menu.querySelectorAll('li').forEach(li => li.classList.toggle('active', li === item));
          toggleMenu(false);
          openExplore();
        });
      });
    }
  },

  switchView(view) {
    gameState.activeView = view;
    this.elements.navTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
    this.elements.contentPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.screen === view));
    if (view === 'character') requestAnimationFrame(() => this.sizeInventoryGrid());
    this.applyPanelBackground();
    try { import('../features/exploration/index.js').then(m => m.Exploration.attachGroundDropHandlers()); } catch {}
    
  },

  applyPanelBackground() {
    const activePanel = document.querySelector('.content-panel.active');
    const container = document.querySelector('.game-content');
    if (!activePanel && !container) return;
    // Determine class by location
    const locKey = (window.Locations?.current?.key) || 'beach';
    // Apply location background image (keep beach background image)
    const classes = ['beach-vector', 'forest-vector', 'mountain-vector', 'desert-vector'];
    if (activePanel) {
      activePanel.classList.remove(...classes);
      if (locKey === 'beach') activePanel.classList.add('beach-vector');
      else if (locKey === 'forest') activePanel.classList.add('forest-vector');
      else if (locKey === 'mountain') activePanel.classList.add('mountain-vector');
      else if (locKey === 'desert') activePanel.classList.add('desert-vector');
    }
    if (container) {
      container.classList.remove(...classes);
      if (locKey === 'beach') container.classList.add('beach-vector');
      else if (locKey === 'forest') container.classList.add('forest-vector');
      else if (locKey === 'mountain') container.classList.add('mountain-vector');
      else if (locKey === 'desert') container.classList.add('desert-vector');
    }

    // Resolve background image URLs robustly (supports .png or .jpg), using onload to avoid HEAD issues
    try {
      const root = document.documentElement;
      const setUrlFromCandidates = (cssVar, candidates) => {
        let index = 0;
        const img = new Image();
        const tryNext = () => {
          if (index >= candidates.length) return;
          const path = candidates[index++];
          img.onload = () => { root.style.setProperty(cssVar, `url('${path}')`); };
          img.onerror = tryNext;
          img.src = path;
        };
        tryNext();
      };
      // Use absolute-like paths to work in dev/prod
      setUrlFromCandidates('--beach-bg-url', ['/assets/beach-background.png', '/assets/beach-background.jpg']);
      setUrlFromCandidates('--beach-bg-url-dark', ['/assets/beach-background-dark.png', '/assets/beach-background-dark.jpg']);
      setUrlFromCandidates('--forest-bg-url', ['/assets/forest-background.png', '/assets/forest-background.jpg']);
      setUrlFromCandidates('--mountain-bg-url', ['/assets/mountain-background.png', '/assets/mountain-background.jpg']);
      setUrlFromCandidates('--desert-bg-url', ['/assets/desert-background.png', '/assets/desert-background.jpg']);
    } catch {}
  },

  setupButtons() {
    if (this.elements.fishBtn) this.elements.fishBtn.addEventListener('click', debounce(() => { 
      AudioManager.playButtonClick(); 
      preventDuplicateClicks(this.elements.fishBtn, 500);
      Fishing.start(); 
    }, 100));
    if (this.elements.exploreBtn) this.elements.exploreBtn.addEventListener('click', debounce((e) => {
      // Ensure first interaction unlocks and starts ambient; avoid double-toggle
      try { AudioManager.startAmbientSounds(); } catch {}
      e.currentTarget?.blur?.();
      preventDuplicateClicks(this.elements.exploreBtn, 500);
      // Toggle reliably
      if (gameState.isExploring) { AudioManager.playButtonClick(); Exploration.stop(); }
      else { AudioManager.playButtonClick(); Exploration.start(); }
    }, 100));
    if (this.elements.exitBtn) this.elements.exitBtn.addEventListener('click', async () => {
      AudioManager.playButtonClick();
      try { 
        // Save game state before logout
        const { SaveManager } = await import('../systems/SaveManager.js');
        await SaveManager.saveNow();
        console.log('Game saved successfully before logout');
      } catch (error) {
        console.error('Failed to save before logout:', error);
      }
      // Notify chat server that this player is leaving so they're removed from active players immediately
      try {
        const chatPlayerId = localStorage.getItem('chatPlayerId');
        const playerName = localStorage.getItem('playerName');
        if (chatPlayerId) {
          const leaveUrl = `${getApiBaseUrl()}/api/chat/leave`;
          console.log('Notifying chat leave at:', leaveUrl, { chatPlayerId, playerName });
          await fetch(leaveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: chatPlayerId, playerName })
          });
          console.log('Chat leave notified');
        }
      } catch (e) {
        console.warn('Failed to notify chat leave:', e);
      }

      try { localStorage.removeItem('authToken'); } catch {}
      try { localStorage.removeItem('playerName'); } catch {}
      try { localStorage.removeItem('chatPlayerId'); } catch {}
      // Hard reload to ensure clean boot into login screen
      window.location.reload();
    });
    if (this.elements.audioToggleBtn) this.elements.audioToggleBtn.addEventListener('click', async () => {
      AudioManager.playButtonClick();
      try { await AudioManager.ensureContext()?.resume?.(); } catch {}
      AudioManager.toggleAmbientSounds();
      const muted = !AudioManager.ambientEnabled;
      this.elements.audioToggleBtn.classList.toggle('muted', muted);
      this.elements.audioToggleBtn.title = muted ? 'Unmute Audio' : 'Mute Audio';
      this.elements.audioToggleBtn.setAttribute('aria-pressed', String(muted));
    });
    if (this.elements.ambienceVolume) this.elements.ambienceVolume.addEventListener('input', (e) => { const volume = parseInt(e.target.value) / 100; AudioManager.setAmbientVolume(volume); });
    if (this.elements.sfxVolume) this.elements.sfxVolume.addEventListener('input', (e) => { const volume = parseInt(e.target.value) / 100; AudioManager.setSfxVolume(volume); });
    
    // Chat color picker in panel
    if (this.elements.chatColorPickerPanel) {
      // Load saved color
      const savedColor = localStorage.getItem('chatNameColor') || '#4ecdc4';
      this.elements.chatColorPickerPanel.value = savedColor;
      
      this.elements.chatColorPickerPanel.addEventListener('input', (e) => {
        const newColor = e.target.value;
        localStorage.setItem('chatNameColor', newColor);
        AudioManager.playButtonClick();
      });
    }
    
    // Removed save button - everything auto-saves to server now
    
    // Removed layout tool buttons

    // Floating panel toggles (show/hide)
    const zonesBtn = document.getElementById('toggleZones');
    const zonesPanel = document.getElementById('panel-zones');
    const equipBtn = document.getElementById('toggleEquipment');
    const invBtn = document.getElementById('toggleInventory');
    const skillsBtn = document.getElementById('toggleSkills');
    const chatBtn = document.getElementById('toggleChat');
    const marketBtn = document.getElementById('toggleMarket');
    const equipPanel = document.getElementById('panel-equipment');
    const invPanel = document.getElementById('panel-inventory');
    const skillsPanel = document.getElementById('panel-skills');
    const chatPanel = document.getElementById('panel-chat');
    const marketPanel = document.getElementById('panel-market');
    
    const isVisible = (panel) => panel && panel.style.display !== 'none';
    const syncFab = (btn, panel) => {
      if (!btn || !panel) return;
      const v = isVisible(panel);
      btn.classList.toggle('active', v);
      btn.setAttribute('aria-pressed', String(v));
    };
    
    // Mobile single menu management
    const isMobile = () => window.innerWidth <= 768;
    const closeAllPanels = () => {
      [equipPanel, invPanel, skillsPanel, chatPanel, zonesPanel, marketPanel].forEach(panel => {
        if (panel && isVisible(panel)) {
          panel.style.display = 'none';
        }
      });
      // Update all button states
      syncFab(equipBtn, equipPanel);
      syncFab(invBtn, invPanel);
      syncFab(skillsBtn, skillsPanel);
      syncFab(chatBtn, chatPanel);
      syncFab(zonesBtn, zonesPanel);
      syncFab(marketBtn, marketPanel);
    };
    
    const togglePanel = (panel) => {
      if (!panel) return;
      const visible = isVisible(panel);
      
      // On mobile, close all other panels first
      if (isMobile() && !visible) {
        closeAllPanels();
      }
      
      panel.style.display = visible ? 'none' : 'block';
      if (!visible) { try { panel.querySelector('.drag-handle')?.focus?.(); } catch {} }
    };
    if (zonesBtn) zonesBtn.addEventListener('click', (e) => { e.currentTarget?.blur?.(); AudioManager.playButtonClick(); togglePanel(zonesPanel); syncFab(zonesBtn, zonesPanel); if (zonesPanel && zonesPanel.style.display !== 'none') { try { import('../features/zones/index.js').then(({ SkillingZones }) => SkillingZones.renderAllInPanel()); } catch {} } });
    if (equipBtn) equipBtn.addEventListener('click', (e) => { e.currentTarget?.blur?.(); AudioManager.playButtonClick(); togglePanel(equipPanel); syncFab(equipBtn, equipPanel); });
    if (invBtn) invBtn.addEventListener('click', (e) => { e.currentTarget?.blur?.(); AudioManager.playButtonClick(); togglePanel(invPanel); syncFab(invBtn, invPanel); });
    if (skillsBtn) skillsBtn.addEventListener('click', (e) => { e.currentTarget?.blur?.(); AudioManager.playButtonClick(); togglePanel(skillsPanel); syncFab(skillsBtn, skillsPanel); });
    if (chatBtn) chatBtn.addEventListener('click', (e) => { 
      e.currentTarget?.blur?.(); 
      AudioManager.playButtonClick(); 
      togglePanel(chatPanel); 
      syncFab(chatBtn, chatPanel); 
      if (chatPanel && chatPanel.style.display !== 'none') { 
        // Update chat header with current username
        this.updateChatHeader();
        
        try { 
          document.getElementById('chat-input')?.focus?.(); 
          // Request fresh player list when chat panel opens
          if (window.globalChat && window.globalChat.ws && window.globalChat.ws.readyState === 1) {
            console.log('Requesting fresh player list on chat panel open');
            window.globalChat._send({ type: 'requestPlayers' });
          }
        } catch {} 
        // Reset unread count when opening chat
        if (this.resetChatUnreadCount) {
          this.resetChatUnreadCount();
        } else {
          chatBtn.classList.remove('has-notification'); 
        }
      } 
    });
    
    // Market panel toggle
    if (marketBtn) marketBtn.addEventListener('click', (e) => { 
      e.currentTarget?.blur?.(); 
      AudioManager.playButtonClick(); 
      togglePanel(marketPanel); 
      syncFab(marketBtn, marketPanel); 
      if (marketPanel && marketPanel.style.display !== 'none') {
        this.initTestMarket(); // Initialize test data
        
        // Set up more frequent auto-refresh for better user experience
        if (!this.marketRefreshInterval) {
          this.marketRefreshInterval = setInterval(() => {
            this.autoRefreshCurrentMarketTab();
          }, 10000); // Refresh every 10 seconds for real-time updates
        }
        
        // Load both equipment and resources tabs
        this.loadMarketListings('equipment');
        this.loadMarketListings('resources');
      } else {
        // Clear refresh interval when panel closes
        if (this.marketRefreshInterval) {
          clearInterval(this.marketRefreshInterval);
          this.marketRefreshInterval = null;
        }
      }
    });
    
    // Initialize pressed state
    syncFab(zonesBtn, zonesPanel);
    syncFab(equipBtn, equipPanel);
    syncFab(invBtn, invPanel);
    syncFab(skillsBtn, skillsPanel);
    syncFab(chatBtn, chatPanel);
    syncFab(marketBtn, marketPanel);

    // Setup close buttons for all panels
    const setupCloseButtons = () => {
      document.querySelectorAll('.panel-close-btn').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const panel = closeBtn.closest('.draggable-panel');
          if (panel) {
            AudioManager.playButtonClick();
            panel.style.display = 'none';
            
            // Update FAB button state
            const panelId = panel.id;
            const fabMapping = {
              'panel-zones': zonesBtn,
              'panel-equipment': equipBtn,
              'panel-inventory': invBtn,
              'panel-skills': skillsBtn,
              'panel-chat': chatBtn,
              'panel-market': marketBtn
            };
            
            const correspondingBtn = fabMapping[panelId];
            if (correspondingBtn) {
              syncFab(correspondingBtn, panel);
            }
            
            // Clear market refresh interval if closing market panel
            if (panelId === 'panel-market' && this.marketRefreshInterval) {
              clearInterval(this.marketRefreshInterval);
              this.marketRefreshInterval = null;
            }
          }
        });
      });
    };
    
    setupCloseButtons();

    // Mobile panel close functionality
    const setupMobileClose = () => {
      document.querySelectorAll('.draggable-panel').forEach(panel => {
        const dragHandle = panel.querySelector('.drag-handle');
        if (dragHandle) {
          dragHandle.addEventListener('click', (e) => {
            // Check if clicked on the close button (::after pseudo-element)
            const rect = dragHandle.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Close button is positioned at the right side
            if (clickX > rect.width - 40 && window.innerWidth <= 768) {
              panel.style.display = 'none';
              
              // Update corresponding button state
              if (panel.id === 'panel-zones') syncFab(zonesBtn, panel);
              if (panel.id === 'panel-equipment') syncFab(equipBtn, panel);
              if (panel.id === 'panel-inventory') syncFab(invBtn, panel);
              if (panel.id === 'panel-skills') syncFab(skillsBtn, panel);
              if (panel.id === 'panel-market') syncFab(marketBtn, panel);
              if (panel.id === 'panel-chat') { 
                syncFab(chatBtn, panel); 
                if (this.resetChatUnreadCount) {
                  this.resetChatUnreadCount();
                } else {
                  chatBtn?.classList.remove('has-notification'); 
                }
              }
            }
          });
        }
      });
    };
    setupMobileClose();

    // ESC closes the last-open visible panel
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const container = document.getElementById('desktop-panels');
      if (!container) return;
      const openPanels = Array.from(container.querySelectorAll('.draggable-panel'))
        .filter((p) => p.style.display !== 'none');
      if (openPanels.length === 0) return;
      const top = openPanels[openPanels.length - 1];
      top.style.display = 'none';
      if (top.id === 'panel-equipment') syncFab(equipBtn, top);
      if (top.id === 'panel-inventory') syncFab(invBtn, top);
      if (top.id === 'panel-skills') syncFab(skillsBtn, top);
      if (top.id === 'panel-market') syncFab(marketBtn, top);
      if (top.id === 'panel-chat') { 
        syncFab(chatBtn, top); 
        if (this.resetChatUnreadCount) {
          this.resetChatUnreadCount();
        } else {
          chatBtn?.classList.remove('has-notification'); 
        }
      }
    });
    // Settings panel toggle
    if (this.elements.settingsBtn && this.elements.settingsPanel) {
      const btn = this.elements.settingsBtn;
      const panel = this.elements.settingsPanel;
      const toggle = (open) => {
        if (open) {
          panel.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        } else {
          panel.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
        }
      };
      let open = false;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        open = !open; toggle(open);
      });
      document.addEventListener('click', (e) => {
        if (!open) return;
        if (!panel.contains(e.target) && e.target !== btn) {
          open = false; toggle(false);
        }
      });
    }

    // Ground trash clear button
    try {
      const gt = document.getElementById('ground-trash');
      if (gt) {
        gt.addEventListener('click', () => {
          try { AudioManager.playDelete(); } catch { AudioManager.playButtonClick?.(); }
          const container = document.getElementById('discoveries') || document.querySelector('.game-content');
          if (!container) return;
          container.querySelectorAll('.ground-item, .discovery-card').forEach(el => el.remove());
        });
      }
    } catch {}

  },

  bindResetAccount() {
    const btn = document.getElementById('resetAccountBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      AudioManager.playButtonClick?.();
      const confirmBox = document.createElement('div');
      confirmBox.className = 'auth-modal';
      confirmBox.innerHTML = `
        <div class="auth-dialog" role="dialog" aria-modal="true">
          <h3>Reset Account</h3>
          <p style="font-size:12px;margin:8px 0;">This will erase your account save data. This cannot be undone.</p>
          <div class="auth-actions">
            <button id="ra-confirm" class="primary-btn">Confirm</button>
            <button id="ra-cancel" class="header-btn">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(confirmBox);
      const close = () => confirmBox.remove();
      confirmBox.querySelector('#ra-cancel')?.addEventListener('click', close);
      confirmBox.querySelector('#ra-confirm')?.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('authToken');
          if (token) {
            // Delete the entire account from the server
            const currentHost = window.location.hostname;
            const response = await fetch(`${getApiBaseUrl()}/api/me`, { 
              method: 'DELETE', 
              headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
              console.error('Failed to delete account from server');
            }
          }
        } catch (error) {
          console.error('Error deleting account:', error);
        }
        
        // Clear all local storage
        try { localStorage.removeItem('sandboxIdleState'); } catch {}
        try { localStorage.removeItem('fish_discovered'); } catch {}
        try { localStorage.removeItem('authToken'); } catch {}
        try { localStorage.removeItem('playerName'); } catch {}
        
        close();
        
        // Show confirmation message and reload
        const status = document.getElementById('status');
        if (status) status.textContent = 'Account deleted successfully';
        
        // Return to login
        setTimeout(() => window.location.reload(), 1000);
      });
    });
  },

  // Global chat functionality with full UI integration
  initChat() {
    // Prevent multiple initializations
    if (this.chatInitialized) {
      console.log('Chat already initialized, skipping...');
      return;
    }
    
    // Update chat header with username
    this.updateChatHeader();
    
    const chatBtn = document.getElementById('toggleChat');
    const chatPanel = document.getElementById('panel-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const togglePlayersBtn = document.getElementById('togglePlayersBtn');
    const chatSidebar = document.getElementById('chatSidebar');
    const playersCount = document.querySelector('.players-count');
    const notificationBadge = chatBtn?.querySelector('.notification-badge');
    
    if (!chatMessages || !chatInput || !chatSend) {
      console.warn('Chat UI elements not found');
      return;
    }

    // Mark as initialized
    this.chatInitialized = true;
    console.log('Initializing chat client...');

    // Unread message counter
    let unreadCount = 0;
    
    // Player name colors storage
    const playerColors = new Map();
    const chatColors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
      '#eb4d4b', '#6c5ce7', '#a29bfe', '#fd79a8', '#e17055',
      '#00b894', '#00cec9', '#0984e3', '#6c5ce7', '#fdcb6e',
      '#e84393', '#9b59b6', '#3498db', '#1abc9c', '#2ecc71',
      '#f39c12', '#e67e22', '#e74c3c', '#8e44ad', '#2980b9'
    ];
    
    // Function to get color for a player name
    const getPlayerColor = (playerName) => {
      const currentPlayerName = localStorage.getItem('playerName') || '';
      
      // If it's the current player, use their chosen color
      if (playerName === currentPlayerName) {
        return localStorage.getItem('chatNameColor') || '#4ecdc4';
      }
      
      // For other players, use deterministic color based on name
      if (!playerColors.has(playerName)) {
        let hash = 0;
        for (let i = 0; i < playerName.length; i++) {
          hash = playerName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colorIndex = Math.abs(hash) % chatColors.length;
        playerColors.set(playerName, chatColors[colorIndex]);
      }
      return playerColors.get(playerName);
    };

    const updateNotificationBadge = () => {
      if (!chatBtn || !notificationBadge) return;
      
      if (unreadCount > 0) {
        chatBtn.classList.add('has-notification');
        notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
      } else {
        chatBtn.classList.remove('has-notification');
        notificationBadge.textContent = '';
      }
    };

    const resetUnreadCount = () => {
      unreadCount = 0;
      updateNotificationBadge();
    };

    // Store reset function on UI object so it can be called from button handler
    this.resetChatUnreadCount = resetUnreadCount;

    // Players list toggle functionality
    let playersVisible = false;
    
    const togglePlayersList = () => {
      playersVisible = !playersVisible;
      if (chatSidebar) {
        chatSidebar.classList.toggle('hidden', !playersVisible);
      }
      if (chatPanel) {
        chatPanel.classList.toggle('with-sidebar', playersVisible);
      }
      if (togglePlayersBtn) {
        togglePlayersBtn.classList.toggle('active', playersVisible);
        togglePlayersBtn.title = playersVisible ? 'Hide Online Players' : 'Show Online Players';
      }
      
      // Request fresh player list when showing players
      if (playersVisible && window.globalChat && window.globalChat.ws && window.globalChat.ws.readyState === 1) {
        console.log('Requesting fresh player list on players panel open');
        window.globalChat._send({ type: 'requestPlayers' });
      }
    };

    if (togglePlayersBtn) {
      togglePlayersBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering panel drag
        togglePlayersList();
      });
    }

    const setStatus = (status) => {
      console.log('Chat status update:', status);
      if (!chatBtn) {
        console.warn('Chat button not found for status update');
        return;
      }
      chatBtn.classList.toggle('online', status === 'online');
      chatBtn.classList.toggle('offline', status !== 'online');
      chatBtn.title = status === 'online' ? 'Global Chat (Online)' : 'Global Chat (Offline)';
      console.log('Applied chat status classes:', chatBtn.className);
    };

    // Local flag to avoid repeating the connected notification
    let chatConnectedNotified = false;

    const addMessage = (msg) => {
      console.log('Chat message received:', msg);
      const messageEl = document.createElement('div');
      messageEl.className = `chat-message ${msg.type}`;
      
      const timeStr = new Date(msg.ts || Date.now()).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Prepare data attributes for deduplication
      messageEl.dataset.name = msg.name || '';
      messageEl.dataset.text = msg.text || '';
      messageEl.dataset.ts = String(msg.ts || Date.now());

      if (msg.type === 'system') {
        messageEl.innerHTML = `<span class="chat-time">${timeStr}</span> <span class="chat-system">${msg.text}</span>`;
      } else if (msg.type === 'chat') {
        const playerColor = getPlayerColor(msg.name);
        messageEl.innerHTML = `<span class="chat-time">${timeStr}</span> <span class="chat-name" style="color: ${playerColor}; font-weight: bold;">${msg.name}</span>: <span class="chat-text">${msg.text}</span>`;
      } else if (msg.type === 'players') {
        // Update online players list
        updatePlayersList(msg.players);
        return; // Don't add this to chat messages
      }
      
      // Enhanced deduplication: check last few messages to prevent duplicates
      const existingMessages = Array.from(chatMessages.children).slice(-5); // Check last 5 messages
      const isDuplicate = existingMessages.some(existing => 
        existing.dataset && existing.dataset.name === (msg.name || '') && 
        existing.dataset.text === (msg.text || '') &&
        Math.abs(parseInt(existing.dataset.ts || '0') - (msg.ts || Date.now())) < 5000 // Within 5 seconds
      );
      
      if (isDuplicate) {
        console.log('Skipping duplicate message:', msg);
        return;
      }
      
      chatMessages.appendChild(messageEl);
      
      // Auto-scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;
      
      // Show notification if chat panel is closed and message is from another player
      if (chatBtn && chatPanel) {
        const isChatVisible = chatPanel.style.display === 'block';
        const currentPlayerName = localStorage.getItem('playerName') || '';
        const isFromOtherPlayer = msg.type === 'chat' && msg.name && msg.name !== currentPlayerName;
        
        if (!isChatVisible && isFromOtherPlayer) {
          unreadCount++;
          updateNotificationBadge();
          // Play notification sound
          try {
            AudioManager.playChatNotification();
          } catch (e) {
            console.warn('Could not play chat notification sound:', e);
          }
        }
      }
      
      // Limit message history to prevent memory issues
      while (chatMessages.children.length > 100) {
        chatMessages.removeChild(chatMessages.firstChild);
      }
    };

    const updatePlayersList = (players) => {
      const playersContainer = document.getElementById('online-players');
      if (!playersContainer) return;
      
      console.log('Updating players list:', players);
      const currentPlayerName = localStorage.getItem('playerName') || '';
      console.log('Current player name from localStorage:', currentPlayerName);
      
      // Deduplicate by name to avoid duplicates from server
      const seen = new Set();
      const uniquePlayers = [];
      for (const p of players) {
        const nm = p?.name;
        if (!nm || seen.has(nm)) continue;
        seen.add(nm);
        uniquePlayers.push(p);
      }

      // Update players count in button (use deduplicated count)
      if (playersCount) {
        playersCount.textContent = uniquePlayers.length.toString();
      }
      
      playersContainer.innerHTML = '';
      
      if (uniquePlayers.length === 0) {
        const noPlayersEl = document.createElement('div');
        noPlayersEl.className = 'player-item';
        noPlayersEl.textContent = 'No players online';
        noPlayersEl.style.fontStyle = 'italic';
        noPlayersEl.style.opacity = '0.6';
        playersContainer.appendChild(noPlayersEl);
        return;
      }
      uniquePlayers.forEach(player => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        const isCurrentPlayer = player.name === currentPlayerName;
        if (isCurrentPlayer) {
          playerEl.classList.add('current-player');
          console.log('Found current player:', player.name);
        }
        playerEl.textContent = player.name;
        playersContainer.appendChild(playerEl);
        console.log(`Added player: ${player.name} (current: ${isCurrentPlayer})`);
      });
    };

    const sendMessage = debounce(() => {
      const text = chatInput.value.trim();
      if (!text) return;
      
      preventDuplicateClicks(chatSend, 300);
      chat.sendChat(text);
      chatInput.value = '';
    }, 100);

    // Set up event listeners
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });

    // Cleanup any existing chat client
    if (window.globalChat) {
      console.log('Cleaning up existing chat client...');
      try {
        if (window.globalChat.ws) {
          window.globalChat.ws.close();
        }
        // Clear the global reference
        window.globalChat = null;
      } catch (e) {
        console.log('Error cleaning up existing chat:', e);
      }
    }

    // Initialize chat client (HTTP-only mode)
    const chat = new ChatClient({});
    chat.mode = 'http'; // Force HTTP mode, no WebSocket
    chat.onStatus(setStatus);
    chat.onMessage(addMessage);
    chat.connect();
    // Check status more frequently to ensure proper detection
    let statusCheckCount = 0;
    const statusCheckInterval = setInterval(() => {
      try {
        const info = chat.getDebugInfo?.();
        console.log('Chat status check:', info);
        if (info && info.mode === 'http' && chat._httpStarted) {
          console.log('Chat connected in HTTP mode');
          setStatus('online');
          // show local-only connected notice in chat once per connection
          try {
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages && !chatMessages.querySelector('.connected-notice')) {
              const msgEl = document.createElement('div');
              msgEl.className = 'chat-message system connected-notice';
              msgEl.textContent = 'Connected to Global Chat';
              chatMessages.appendChild(msgEl);
              setTimeout(() => { try { if (msgEl.parentNode) msgEl.parentNode.removeChild(msgEl); } catch {} }, 3000);
            }
          } catch (e) { console.warn('Could not show connected notice', e); }

          clearInterval(statusCheckInterval);
        } else if (statusCheckCount > 10) {
          // After 10 checks (~6 seconds), give up
          console.log('Chat connection timeout, setting offline');
          setStatus('offline');
          clearInterval(statusCheckInterval);
        }
        statusCheckCount++;
      } catch {}
    }, 600);
    
    // Store chat instance for debugging
    window.globalChat = chat;
    
    // Initialize market sync after chat connection (HTTP mode)
    setTimeout(() => {
      if (window.globalChat && window.globalChat.mode === 'http') {
        console.log('Initializing market sync...');
        this.initializeMarketSync();
      }
    }, 2000); // Wait 2 seconds for connection to stabilize
    
    // Debug function for checking market state
    window.debugMarket = () => {
      console.log('=== Market Debug Info ===');
      console.log('Server market listings:', this.serverMarketListings);
      console.log('Server listings count:', (this.serverMarketListings || []).length);
      console.log('Chat connected:', window.globalChat?.ws?.readyState === 1);
      console.log('========================');
    };
    
    // Debug function for checking chat state
    window.debugChat = () => {
      console.log('=== Chat Debug Info ===');
      console.log('Current player name (localStorage):', localStorage.getItem('playerName'));
      console.log('Chat client name:', chat.name);
      console.log('WebSocket state:', chat.ws?.readyState);
      console.log('WebSocket state text:', ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][chat.ws?.readyState] || 'NONE');
      console.log('Chat debug info:', chat.getDebugInfo());
      console.log('Players count element:', playersCount?.textContent);
      console.log('Players container children:', document.getElementById('online-players')?.children.length);
      console.log('Location hostname:', location.hostname);
      console.log('Location port:', location.port);
      console.log('Location protocol:', location.protocol);
      console.log('========================');
    };
    
    // Manual reconnect function for debugging
    window.reconnectChat = () => {
      console.log('Manually reconnecting chat...');
      chat.forceReconnect();
    };
  },


  updateStats() {
    const { stats } = gameState;
    if (this.elements.hpBar) this.elements.hpBar.style.width = `${(stats.hp / stats.hpMax) * 100}%`;
    if (this.elements.staminaBar) this.elements.staminaBar.style.width = `${(stats.stamina / stats.staminaMax) * 100}%`;
    if (this.elements.manaBar) this.elements.manaBar.style.width = `${(stats.mana / stats.manaMax) * 100}%`;
    
    // Update coin display
    this.updateCoinDisplay();
  },

  updateCoinDisplay() {
    const coinCountElement = document.getElementById('coin-count');
    if (coinCountElement && gameState.coins !== undefined) {
      coinCountElement.textContent = gameState.coins;
    }
  },

  updateSkills() {
    // Fishing
    const fishingLevel = $('fishing-level-display'); if (fishingLevel) fishingLevel.textContent = gameState.fishing.level;
    const expDisplay = $('exp-display'); if (expDisplay) expDisplay.textContent = gameState.fishing.xp;
    const expNeeded = $('exp-needed-display'); if (expNeeded) expNeeded.textContent = gameState.fishing.xpToNext;
    const fishingPct = Math.min(100, (gameState.fishing.xp / gameState.fishing.xpToNext) * 100);
    document.querySelectorAll('.skill-card[data-skill="fishing"]').forEach((el) => {
      el.style.setProperty('--progress-pct', `${fishingPct}%`);
      // Lock icon to animated fish
      try {
        const iconWrap = el.querySelector('.skill-icon-large svg');
        if (iconWrap) {
          iconWrap.classList.add('fish-animated');
          const useEl = iconWrap.querySelector('use') || document.createElementNS('http://www.w3.org/2000/svg', 'use');
          if (!useEl.parentNode) iconWrap.appendChild(useEl);
          useEl.setAttribute('href', '#fish-koi');
        }
      } catch {}
    });

    // Foraging
    const foragingPct = Math.min(100, (gameState.foraging.xp / gameState.foraging.xpToNext) * 100);
    document.querySelectorAll('.skill-card[data-skill="foraging"]').forEach((el) => el.style.setProperty('--progress-pct', `${foragingPct}%`));
    document.querySelectorAll('[data-skill-level="foraging"]').forEach((el) => { el.textContent = gameState.foraging.level; });

    // Exploration
    const explorationPct = Math.min(100, (gameState.exploration.xp / gameState.exploration.xpToNext) * 100);
    document.querySelectorAll('.skill-card[data-skill="exploration"]').forEach((el) => el.style.setProperty('--progress-pct', `${explorationPct}%`));
    document.querySelectorAll('[data-skill-level="exploration"]').forEach((el) => { el.textContent = gameState.exploration.level; });

    // Combat skills
    ['attack', 'strength', 'defense'].forEach(skill => {
      const pct = Math.min(100, (gameState.combat[skill].xp / gameState.combat[skill].xpToNext) * 100);
      document.querySelectorAll(`.skill-card[data-skill="${skill}"]`).forEach((el) => el.style.setProperty('--progress-pct', `${pct}%`));
      document.querySelectorAll(`[data-skill-level="${skill}"]`).forEach((el) => { el.textContent = gameState.combat[skill].level; });
    });

    // Fishing
    document.querySelectorAll('[data-skill-level="fishing"]').forEach((el) => { el.textContent = gameState.fishing.level; });
  },

  updateAll() { this.updateStats(); this.updateSkills(); this.updateClock(); },

  updateClock() {
    if (!this.elements.clock) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.elements.clock.textContent = timeStr;
  },

  setStatus(text) { if (this.elements.status) this.elements.status.textContent = text; },

  addToLog(message) { /* log removed */ },

  saveGame() {
    try {
      localStorage.setItem('sandboxIdleState', JSON.stringify(gameState));
      this.setStatus('Game saved!');
      this.addToLog('Game saved successfully');
      AudioManager.playClick();
    } catch (error) {
      this.setStatus('Save failed');
      console.error('Save failed:', error);
    }
  },

  sizeInventoryGrid() {
    const grid = this.elements.invGrid; if (!grid) return;
    grid.style.width = 'auto'; grid.style.height = 'auto';
  },

  loadTheme() {
    // Always use dark mode
    document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('gameTheme', 'dark');
  },

  updateAudioToggleUI() {},

  // Notification system
  notify: window.notify,

  // Market functionality
  initMarketTabs() {
    const buyTab = $('buyTab');
    const sellTab = $('sellTab');
    const myListingsTab = $('myListingsTab');
    const sellHistoryTab = $('sellHistoryTab');
    const equipmentSubTab = $('equipmentSubTab');
    const resourcesSubTab = $('resourcesSubTab');

    // Main tabs
    if (buyTab) {
      buyTab.addEventListener('click', () => {
        this.switchMarketTab('buy');
      });
    }

    if (sellTab) {
      sellTab.addEventListener('click', () => {
        this.switchMarketTab('sell');
      });
    }

    if (myListingsTab) {
      myListingsTab.addEventListener('click', () => {
        this.switchMarketTab('myListings');
      });
    }

    if (sellHistoryTab) {
      sellHistoryTab.addEventListener('click', () => {
        this.switchMarketTab('sellHistory');
      });
    }

    // Sub-tabs
    if (equipmentSubTab) {
      equipmentSubTab.addEventListener('click', () => {
        this.switchMarketSubTab('equipment');
      });
    }

    if (resourcesSubTab) {
      resourcesSubTab.addEventListener('click', () => {
        this.switchMarketSubTab('resources');
      });
    }

    // Initialize market search filters
    const equipmentSearch = $('equipmentSearch');
    const resourcesSearch = $('resourcesSearch');
    const listItemBtn = $('listItemBtn');

    if (equipmentSearch) {
      equipmentSearch.addEventListener('input', (e) => {
        this.filterMarketListings('equipment', e.target.value);
      });
    }

    if (resourcesSearch) {
      resourcesSearch.addEventListener('input', (e) => {
        this.filterMarketListings('resources', e.target.value);
      });
    }

    if (listItemBtn) {
      listItemBtn.addEventListener('click', () => {
        this.listItemForSale();
      });
    }

    // Collect gold button
    const collectAllGoldBtn = $('collectAllGoldBtn');
    if (collectAllGoldBtn) {
      collectAllGoldBtn.addEventListener('click', () => {
        this.collectAllGold();
      });
    }

    // Initialize sell history
    this.loadSellHistory();

    // Initialize with buy tab and equipment sub-tab
    this.switchMarketTab('buy');
    this.switchMarketSubTab('equipment');
  },

  switchMarketTab(tab) {
    const buyTab = $('buyTab');
    const sellTab = $('sellTab');
    const myListingsTab = $('myListingsTab');
    const sellHistoryTab = $('sellHistoryTab');
    const buyContent = $('buyTabContent');
    const sellContent = $('sellTabContent');
    const myListingsContent = $('myListingsTabContent');
    const sellHistoryContent = $('sellHistoryTabContent');

    // Remove active from all tabs
    [buyTab, sellTab, myListingsTab, sellHistoryTab].forEach(t => t?.classList.remove('active'));
    [buyContent, sellContent, myListingsContent, sellHistoryContent].forEach(c => c?.classList.remove('active'));

    if (tab === 'buy') {
      buyTab?.classList.add('active');
      buyContent?.classList.add('active');
      // Show sub-tabs and refresh current sub-tab content
      const activeSubTab = document.querySelector('.market-sub-tab.active');
      if (activeSubTab) {
        const subTabType = activeSubTab.id === 'equipmentSubTab' ? 'equipment' : 'resources';
        this.loadMarketListings(subTabType);
      } else {
        this.switchMarketSubTab('equipment');
      }
    } else if (tab === 'sell') {
      sellTab?.classList.add('active');
      sellContent?.classList.add('active');
      this.populateInventorySelect();
    } else if (tab === 'myListings') {
      myListingsTab?.classList.add('active');
      myListingsContent?.classList.add('active');
      this.loadMyListings();
    } else if (tab === 'sellHistory') {
      sellHistoryTab?.classList.add('active');
      sellHistoryContent?.classList.add('active');
      this.loadSellHistory();
    }
  },

  switchMarketSubTab(subTabType) {
    const equipmentSubTab = $('equipmentSubTab');
    const resourcesSubTab = $('resourcesSubTab');
    const equipmentSubContent = $('equipmentSubTabContent');
    const resourcesSubContent = $('resourcesSubTabContent');

    // Remove active from all sub-tabs
    [equipmentSubTab, resourcesSubTab].forEach(t => t?.classList.remove('active'));
    [equipmentSubContent, resourcesSubContent].forEach(c => c?.classList.remove('active'));

    if (subTabType === 'equipment') {
      equipmentSubTab?.classList.add('active');
      equipmentSubContent?.classList.add('active');
      this.loadMarketListings('equipment');
    } else if (subTabType === 'resources') {
      resourcesSubTab?.classList.add('active');
      resourcesSubContent?.classList.add('active');
      this.loadMarketListings('resources');
    }
  },

  loadMarketListings(category = 'equipment') {
    const containerMap = {
      'equipment': $('equipmentListings'),
      'resources': $('resourcesListings')
    };
    
    const marketListings = containerMap[category];
    if (!marketListings) return;

    const allPlayerListings = this.getPlayerMarketListings();
    
    // Filter listings by category
    const categoryListings = allPlayerListings.filter(listing => {
      const itemType = this.getItemCategory(listing.item, listing.itemType);
      return itemType === category;
    });
    
    if (categoryListings.length === 0) {
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      marketListings.innerHTML = `<div class="market-empty">No ${categoryName.toLowerCase()} listed by other players</div>`;
      return;
    }

    marketListings.innerHTML = categoryListings.map(listing => `
      <div class="market-listing" data-id="${listing.id}">
        <div class="market-item-icon">${this.getItemIconHTML(listing.item, listing.itemType)}</div>
        <div class="market-item-details">
          <div class="market-item-name">${listing.item}</div>
          <div class="market-seller-name">by ${listing.seller}</div>
        </div>
        <div class="market-item-quantity">${listing.quantity}</div>
        <div class="market-item-price">${listing.price}<svg class="coin-icon-small"><use href="#icon-coin"/></svg></div>
        <button class="market-buy-btn" onclick="UI.showBuyDialog('${listing.id}', '${listing.item}', ${listing.quantity}, ${listing.price})">Buy</button>
      </div>
    `).join('');
  },

  // Helper method to determine item category
  getItemCategory(itemName, itemType) {
    // First check if we have an explicit itemType
    if (itemType) {
      const equipmentTypes = ['helmet', 'chest', 'gloves', 'pants', 'shoes', 'ring', 'amulet', 'weapon', 'sword', 'shield', 'bow', 'tool'];
      if (equipmentTypes.includes(itemType)) {
        return 'equipment';
      }
      
      const resourceTypes = ['food', 'material', 'loot', 'currency', 'consumable', 'resource'];
      if (resourceTypes.includes(itemType)) {
        return 'resources';
      }
    }
    
    const itemLower = itemName.toLowerCase();
    
    // Check against our existing game items from ItemCatalog
    const itemMappings = {
      // Equipment (tools and wearables)
      'fishing pole': 'equipment',
      
      // Resources (materials, food, loot, currency)
      'sea shell': 'resources',
      'driftwood': 'resources',
      'seaweed': 'resources',
      'small coin': 'resources',
      'treasure chest': 'resources',
      
      // Fish (all fish go to resources)
      'minnow': 'resources',
      'trout': 'resources',
      'bass': 'resources',
      'salmon': 'resources',
      'golden carp': 'resources',
    };
    
    // Check direct mapping first
    if (itemMappings[itemLower]) {
      return itemMappings[itemLower];
    }
    
    // Equipment keywords for items not in our catalog
    if (itemLower.includes('helmet') || itemLower.includes('armor') || itemLower.includes('chest') ||
        itemLower.includes('gloves') || itemLower.includes('pants') || itemLower.includes('boots') ||
        itemLower.includes('ring') || itemLower.includes('amulet') || itemLower.includes('weapon') ||
        itemLower.includes('sword') || itemLower.includes('shield') || itemLower.includes('bow') ||
        itemLower.includes('tool') || itemLower.includes('pole')) {
      return 'equipment';
    }
    
    // Everything else is resources (including potions, materials, fish, etc.)
    return 'resources';
  },

  // Helper method to get item icon HTML that matches inventory system
  getItemIconHTML(itemName, itemType) {
    // Use the same icon logic as the inventory system
    let symbolId = 'icon-bag';
    let iconColor = '#8B4513';
    
    // Equipment icons
    const equipmentIconMap = {
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
      'Fish': { symbol: 'fish-minnow', color: '#87CEEB' },
      'Raw Fish': { symbol: 'fish-minnow', color: '#87CEEB' },
      'Cooked Fish': { symbol: 'fish-minnow', color: '#DEB887' }
    };
    
    // Resource/material mapping
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
    if (itemType && equipmentIconMap[itemType]) {
      symbolId = equipmentIconMap[itemType].symbol;
      iconColor = equipmentIconMap[itemType].color;
    } 
    // Check fish mapping
    else if (fishMap[itemName]) {
      symbolId = fishMap[itemName].symbol;
      iconColor = fishMap[itemName].color;
    }
    // Check resource mapping
    else if (resourceMap[itemName]) {
      symbolId = resourceMap[itemName].symbol;
      iconColor = resourceMap[itemName].color;
    }
    // Fallback to checking if the symbol exists with common patterns
    else {
      const itemLower = itemName.toLowerCase();
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
    
    return `<svg width="24" height="24" viewBox="0 0 24 24" style="color: ${iconColor}"><use href="#${symbolId}"></use></svg>`;
  },

  populateInventorySelect() {
    const sellItemSelect = $('sellItemSelect');
    if (!sellItemSelect) return;

    const inventory = gameState.inventory || [];
    const availableItems = inventory.filter(item => item && item.name && item.count > 0);

    sellItemSelect.innerHTML = '<option value="">Choose an item...</option>' +
      availableItems.map((item, index) => {
        // Find the actual index in the inventory array
        const actualIndex = inventory.findIndex(invItem => invItem === item);
        return `<option value="${actualIndex}">${item.name} (${item.count})</option>`;
      }).join('');

    // Update quantity max when item is selected
    sellItemSelect.addEventListener('change', (e) => {
      const quantityInput = $('sellQuantity');
      if (e.target.value && quantityInput) {
        const item = inventory[parseInt(e.target.value)];
        if (item) {
          quantityInput.max = item.count;
          quantityInput.value = Math.min(quantityInput.value || 1, item.count);
        }
      }
    });
  },

  loadMyListings() {
    const myListings = $('myListings');
    if (!myListings) return;

    // Get current player's listings from server data only
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const serverPlayerListings = (this.serverMarketListings || []).filter(listing => listing.seller === currentPlayer);
    
    console.log('Loading my listings...');
    console.log('Current player:', currentPlayer);
    console.log('Server player listings:', serverPlayerListings.length, 'listings');
    console.log('Player listings data:', serverPlayerListings);
    
    if (serverPlayerListings.length === 0) {
      myListings.innerHTML = '<div class="market-empty">You have no active listings</div>';
      return;
    }

    myListings.innerHTML = serverPlayerListings.map((listing, index) => `
      <div class="market-listing" data-index="${index}" data-listing-id="${listing.id}">
        <div class="market-item-icon">${this.getItemIconHTML(listing.item, listing.itemType)}</div>
        <div class="market-item-details">
          <div class="market-item-name">${listing.item}</div>
          <div class="market-seller-name">by ${listing.seller}</div>
        </div>
        <div class="market-item-quantity">${listing.quantity}</div>
        <div class="market-item-price">${listing.price}<svg class="coin-icon-small"><use href="#icon-coin"/></svg></div>
        <button class="market-remove-btn" onclick="UI.removeMyListingById('${listing.id}')">Remove</button>
      </div>
    `).join('');
    
    console.log('My listings UI updated with', serverPlayerListings.length, 'listings');
  },

  // Remove listing by ID from both local and server
  removeMyListingById(listingId) {
    console.log('removeMyListingById called with ID:', listingId);
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    
    // Find listing in server data
    const serverPlayerListings = (this.serverMarketListings || []).filter(listing => listing.seller === currentPlayer);
    const listing = serverPlayerListings.find(l => l.id === listingId);
    
    if (!listing) {
      console.log('No server listing found with ID:', listingId);
      this.setStatus('Error: Could not find listing to remove');
      return;
    }

    console.log('Found listing to remove:', listing);

    const token = getAuthToken();
    if (!token) {
      this.setStatus('Please login to remove listings');
      try { this.showLogin(); } catch {}
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/market/remove`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ listingId })
        });
        if (!res.ok) {
          const txt = await res.text();
          console.warn('Remove failed:', res.status, txt);
          this.setStatus('Failed to remove listing');
          return;
        }
        // Return items to inventory
        this.addToInventory(listing.item, listing.quantity);
        // Remove from local cache
        this.serverMarketListings = (this.serverMarketListings || []).filter(l => l.id !== listingId);
        AudioManager.playButtonClick();
        this.setStatus(`Removed ${listing.item} from market and returned to inventory`);
        // Refresh all market displays immediately
        this.loadMyListings();
        this.loadMarketListings('equipment');
        this.loadMarketListings('resources');
      } catch (e) {
        console.error('Remove API error', e);
        this.setStatus('Failed to remove listing');
      }
    })();
  },

  // Get market listings - combine local and server data, excluding current player
  getPlayerMarketListings() {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    
    // Get server listings (only source of truth now)
    const serverListings = this.serverMarketListings || [];
    
    console.log('Server market listings:', serverListings.length, 'total listings');
    console.log('Current player:', currentPlayer);
    
    // Filter out current player's listings (they should see them in "My Listings" tab)
    const otherPlayersListings = serverListings.filter(listing => listing.seller !== currentPlayer);
    console.log('Other players listings:', otherPlayersListings.length);
    
    return otherPlayersListings;
  },

  refreshMarketView() {
    const marketPanel = document.querySelector('#panel-market');
    if (marketPanel && marketPanel.style.display !== 'none') {
      const activeCategory = document.querySelector('.market-category-btn.active')?.textContent || 'All';
      this.filterMarketListings(activeCategory);
      this.loadMyListings();
    }
  },

  listItemForSale() {
    const sellItemSelect = $('sellItemSelect');
    const sellQuantity = $('sellQuantity');
    const sellPrice = $('sellPrice');

    if (!sellItemSelect.value) {
      this.setStatus('Please select an item to sell');
      return;
    }

    const quantity = parseInt(sellQuantity.value);
    const price = parseInt(sellPrice.value);

    if (!quantity || quantity < 1) {
      this.setStatus('Please enter a valid quantity');
      return;
    }

    if (!price || price < 1) {
      this.setStatus('Please enter a valid price');
      return;
    }

    const itemIndex = parseInt(sellItemSelect.value);
    const item = gameState.inventory[itemIndex];

    if (!item || quantity > item.count) {
      this.setStatus('Not enough items in inventory');
      return;
    }

    console.log('Listing item via API:', item.name, 'quantity:', quantity, 'current count:', item.count);

    // Require auth
    const token = getAuthToken();
    if (!token) {
      this.setStatus('Please login to list items');
      try { this.showLogin(); } catch {}
      return;
    }

    // Send to server first
    (async () => {
      const listBtn = document.getElementById('listItemBtn');
      if (listBtn) listBtn.disabled = true;
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/market/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ item: item.name, quantity, price, itemType: item.type || null })
        });
        if (!res.ok) {
          const txt = await res.text();
          console.warn('List failed:', res.status, txt);
          this.setStatus('Failed to list item');
          return;
        }
        const data = await res.json();
        const created = data?.listing;
        // Now remove items from inventory
        item.count -= quantity;
        if (item.count <= 0) {
          gameState.inventory[itemIndex] = null;
        }
        // Update local server listings cache
        if (!this.serverMarketListings) this.serverMarketListings = [];
        if (created) {
          this.serverMarketListings.push(created);
        } else {
          // Fallback: refresh from server
          await this.requestMarketDataFromServer();
        }
        AudioManager.playButtonClick();
        this.setStatus(`Listed ${quantity}x ${item.name} for ${price} coins each!`);
        // Reset form
        sellItemSelect.value = '';
        sellQuantity.value = '1';
        sellPrice.value = '';
        // Update UI immediately
        try {
          if (window.Inventory && window.Inventory.render) {
            window.Inventory.render();
          } else if (window.Inventory && window.Inventory.debouncedRender) {
            window.Inventory.debouncedRender();
          }
        } catch (e) {
          console.log('Could not update inventory display:', e);
        }
        this.populateInventorySelect();
        // Refresh UI tabs
        this.loadMarketListings('equipment');
        this.loadMarketListings('resources');
        this.switchMarketTab('myListings');
      } catch (e) {
        console.error('List API error', e);
        this.setStatus('Failed to list item');
      } finally {
        if (listBtn) listBtn.disabled = false;
      }
    })();
  },

  buyPlayerItem(listingId, quantityToBuy = 1) {
    console.log('buyPlayerItem called with listingId:', listingId, 'quantity:', quantityToBuy);
    const listing = (this.serverMarketListings || []).find(l => l.id === listingId);
    
    if (!listing) {
      this.setStatus('Item no longer available');
      console.log('Listing not found for ID:', listingId);
      return;
    }

    // Check if trying to buy own item
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    if (listing.seller === currentPlayer) {
      this.setStatus('Cannot buy your own items!');
      console.log('Player attempted to buy their own listing');
      return;
    }

    // Validate quantity
    if (quantityToBuy < 1 || quantityToBuy > listing.quantity) {
      this.setStatus('Invalid quantity requested');
      return;
    }

    // Check if player has enough coins
    const totalCost = listing.price * quantityToBuy;
    const playerCoins = gameState.coins || 0;
    if (playerCoins < totalCost) {
      this.setStatus('Not enough coins!');
      console.log('Insufficient coins. Have:', playerCoins, 'Need:', totalCost);
      return;
    }

    // Require auth
    const token = getAuthToken();
    if (!token) {
      this.setStatus('Please login to buy items');
      try { this.showLogin(); } catch {}
      return;
    }

    // Attempt purchase via API first
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/market/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ listingId, quantity: quantityToBuy })
        });
        if (!res.ok) {
          const txt = await res.text();
          console.warn('Buy failed:', res.status, txt);
          this.setStatus('Purchase failed');
          return;
        }
        const data = await res.json();
        // Deduct coins (server is source of truth; client mirrors)
        gameState.coins = (gameState.coins || 0) - totalCost;

        // Add items to inventory with proper error handling and preserved type
        try {
          for (let i = 0; i < quantityToBuy; i++) {
            let singleSuccess = false;
            if (window.Inventory && typeof window.Inventory.addItem === 'function') {
              const buyDialog = document.getElementById('buyDialog');
              const result = window.Inventory.addItem(listing.item, listing.itemType || null, buyDialog);
              singleSuccess = result !== false;
            } else {
              singleSuccess = this.addToInventoryWithType(listing.item, 1, listing.itemType || null);
            }
            if (!singleSuccess) {
              // If any item failed to add, restore coins and stop
              gameState.coins += totalCost;
              this.setStatus('Purchase failed: Inventory full!');
              return;
            }
          }
        } catch (e) {
          console.log('Inventory addition failed:', e);
          gameState.coins += totalCost;
          this.setStatus('Purchase failed: Error adding to inventory');
          return;
        }

        // Update local server listings cache to reflect new quantity
        listing.quantity -= quantityToBuy;
        if (listing.quantity <= 0) {
          this.serverMarketListings = (this.serverMarketListings || []).filter(l => l.id !== listingId);
        }

        AudioManager.playButtonClick();
        const itemText = quantityToBuy === 1 ? listing.item : `${quantityToBuy}x ${listing.item}`;
        this.setStatus(`Purchased ${itemText} for ${totalCost} coins!`);
        this.loadMarketListings('equipment');
        this.loadMarketListings('resources');
        this.loadMyListings();
        this.updateStats();
      } catch (e) {
        console.error('Buy API error', e);
        this.setStatus('Purchase failed');
      }
    })();
  },

  addToInventory(itemName, quantity) {
    return this.addToInventoryWithType(itemName, quantity, null);
  },

  addToInventoryWithType(itemName, quantity, itemType) {
    console.log('Adding to inventory:', itemName, 'quantity:', quantity, 'type:', itemType);
    
    // Ensure we have a valid inventory array
    if (!gameState.inventory || !Array.isArray(gameState.inventory)) {
      gameState.inventory = new Array(24).fill(null);
    }
    
    // Find existing item with the same name (case-insensitive)
    let existingIndex = gameState.inventory.findIndex(item => 
      item && item.name && item.name.toLowerCase() === itemName.toLowerCase()
    );
    
    if (existingIndex !== -1) {
      // Stack with existing item
      gameState.inventory[existingIndex].count += quantity;
      console.log('Stacked with existing item at index', existingIndex, '. New count:', gameState.inventory[existingIndex].count);
    } else {
      // Find first empty slot
      let emptyIndex = -1;
      for (let i = 0; i < gameState.inventory.length; i++) {
        if (!gameState.inventory[i] || !gameState.inventory[i].name) {
          emptyIndex = i;
          break;
        }
      }
      
      if (emptyIndex !== -1) {
        // Use provided type if available, otherwise try to detect from name
        let finalType = itemType;
        
        if (!finalType) {
          // Determine item type and icon based on name for better inventory display
          const itemLower = itemName.toLowerCase();
          
          // Equipment type detection with more comprehensive matching
          if (itemLower.includes('helmet') || itemLower.includes('hat') || itemLower.includes('cap') || 
              itemLower.includes('hood') || itemLower.includes('crown') || itemLower.includes('circlet')) {
            finalType = 'helmet';
          } else if (itemLower.includes('chest') || itemLower.includes('armor') || itemLower.includes('chestplate') ||
                     itemLower.includes('tunic') || itemLower.includes('robe') || itemLower.includes('vest') ||
                     itemLower.includes('mail') || itemLower.includes('plate')) {
            finalType = 'chest';
          } else if (itemLower.includes('glove') || itemLower.includes('gauntlet') || itemLower.includes('mitt')) {
            finalType = 'gloves';
          } else if (itemLower.includes('pant') || itemLower.includes('leg') || itemLower.includes('trouser') ||
                     itemLower.includes('greave') || itemLower.includes('kilt') || itemLower.includes('skirt')) {
            finalType = 'pants';
          } else if (itemLower.includes('boot') || itemLower.includes('shoe') || itemLower.includes('feet') ||
                     itemLower.includes('sandal') || itemLower.includes('slipper')) {
            finalType = 'shoes';
          } else if (itemLower.includes('ring')) {
            finalType = 'ring';
          } else if (itemLower.includes('amulet') || itemLower.includes('necklace') || itemLower.includes('pendant') ||
                     itemLower.includes('charm') || itemLower.includes('talisman')) {
            finalType = 'amulet';
          }
          
          // Check if the item already exists in starting equipment to preserve type
          const startingEquipment = [
            { name: 'Leather Helmet', type: 'helmet' },
            { name: 'Leather Chest', type: 'chest' },
            { name: 'Leather Gloves', type: 'gloves' },
            { name: 'Leather Pants', type: 'pants' },
            { name: 'Leather Boots', type: 'shoes' }
          ];
          
          const matchingEquip = startingEquipment.find(eq => 
            eq.name.toLowerCase() === itemLower || itemLower.includes(eq.name.toLowerCase())
          );
          if (matchingEquip) {
            finalType = matchingEquip.type;
          }
        }
        
        gameState.inventory[emptyIndex] = { 
          name: itemName, 
          count: quantity,
          type: finalType,
          icon: null // Store icon info if available
        };
        console.log('Added to empty slot', emptyIndex, 'with count:', quantity, 'and type:', finalType);
      } else {
        console.log('No inventory space available!');
        this.setStatus('Inventory full! Could not add item.');
        return false;
      }
    }
    
    // Force update inventory display using multiple methods
    try {
      // Try the main Inventory module render method
      if (window.Inventory && typeof window.Inventory.render === 'function') {
        window.Inventory.render();
        console.log('Inventory display updated via Inventory.render()');
      } else if (window.Inventory && typeof window.Inventory.debouncedRender === 'function') {
        window.Inventory.debouncedRender();
        console.log('Inventory display updated via debouncedRender()');
      }
      
      // Also trigger a general UI update
      if (this.updateStats) {
        this.updateStats();
      }
      
      // Refresh the sell items dropdown in the market
      this.populateInventorySelect();
      
    } catch (e) {
      console.log('Could not update inventory display:', e);
    }
    
    console.log('Final inventory state:', gameState.inventory);
    return true;
  },

  // Legacy method for compatibility - now redirects to buyPlayerItem
  buyItem(listingId) {
    this.buyPlayerItem(listingId);
  },

  filterMarketListings(category, searchTerm = null) {
    const containerMap = {
      'equipment': $('equipmentListings'),
      'resources': $('resourcesListings')
    };
    
    const container = containerMap[category];
    if (!container) return;
    
    const listings = container.querySelectorAll('.market-listing');
    
    listings.forEach(listing => {
      let visible = true;
      
      if (searchTerm) {
        const itemName = listing.querySelector('.market-item-name')?.textContent?.toLowerCase();
        visible = itemName?.includes(searchTerm.toLowerCase()) || false;
      }
      
      listing.style.display = visible ? 'flex' : 'none';
    });
  },

  initTestMarket() {
    // Give player some coins for testing
    if (!gameState.coins || gameState.coins < 100) {
      gameState.coins = 500;
      this.updateStats();
    }

    // No longer adding test listings - real player listings only
    console.log('Market initialized - ready for real player listings only');
    
    // Always fetch the latest from server on open
    this.requestMarketDataFromServer();
  },

  // Remove all test listings from the market
  removeAllTestListings() {
    // Only operate on server listings now
    if (this.serverMarketListings) {
      const originalLength = this.serverMarketListings.length;
      this.serverMarketListings = this.serverMarketListings.filter(listing => 
        !listing.seller.startsWith('TestPlayer') && 
        !listing.id.startsWith('test_')
      );
      
      if (this.serverMarketListings.length !== originalLength) {
        console.log(`Removed ${originalLength - this.serverMarketListings.length} test listings. ${this.serverMarketListings.length} real listings remain.`);
      }
    }
  },

  // Auto-refresh market listings from server (used internally by auto-refresh timers)
  refreshMarketListings() {
    console.log('Auto-refreshing market listings from SERVER...');
    
    // Request fresh data from server - this is the ONLY source of truth
    this.requestMarketDataFromServer();
    
    console.log('Market auto-refresh requested from server');
  },

  // Auto-refresh the currently visible market tab without switching tabs
  autoRefreshCurrentMarketTab() {
    const marketPanel = document.getElementById('panel-market');
    
    // Only refresh if market panel is visible
    if (!marketPanel || marketPanel.style.display === 'none') {
      return;
    }
    
    // Get the currently active tab and sub-tab
    const activeMainTab = document.querySelector('.market-tab.active');
    const activeSubTab = document.querySelector('.market-sub-tab.active');
    
    if (!activeMainTab || !activeSubTab) {
      return;
    }
    
    const mainTabType = activeMainTab.dataset.tab;
    const subTabType = activeSubTab.dataset.subTab;
    
    // Only auto-refresh the buy tab (where listings are shown)
    if (mainTabType === 'buy') {
      console.log(`Auto-refreshing ${subTabType} listings...`);
      
      // Request fresh data from server (this will trigger refreshCurrentMarketView)
      this.requestMarketDataFromServer();
    }
  },

  // Buy dialog functions
  showBuyDialog(listingId, itemName, maxQuantity, priceEach) {
    this.currentBuyListing = { listingId, itemName, maxQuantity, priceEach };
    
    const dialog = $('buyDialog');
    const itemIcon = $('buyItemIcon');
    const itemNameEl = $('buyItemName');
    const itemAvailable = $('buyItemAvailable');
    const buyAmount = $('buyAmount');
    const totalCost = $('buyTotalCost');

    // Get the listing from server data to access itemType
    const listing = (this.serverMarketListings || []).find(l => l.id === listingId);
    
    itemIcon.innerHTML = this.getItemIconHTML(itemName, listing?.itemType);
    itemNameEl.textContent = itemName;
    itemAvailable.textContent = `Available: ${maxQuantity}`;
    buyAmount.max = maxQuantity;
    buyAmount.value = 1;
    totalCost.innerHTML = `${priceEach}<svg class="coin-icon-small"><use href="#icon-coin"/></svg>`;

    // Update total when quantity changes
    buyAmount.addEventListener('input', () => {
      const amount = parseInt(buyAmount.value) || 1;
      const total = amount * priceEach;
      totalCost.innerHTML = `${total}<svg class="coin-icon-small"><use href="#icon-coin"/></svg>`;
    });

    dialog.style.display = 'flex';
  },

  closeBuyDialog() {
    const dialog = $('buyDialog');
    dialog.style.display = 'none';
    this.currentBuyListing = null;
  },

  confirmBuy() {
    if (!this.currentBuyListing) return;

    const buyAmount = $('buyAmount');
    const quantity = parseInt(buyAmount.value) || 1;
    const { listingId, priceEach, maxQuantity } = this.currentBuyListing;

    if (quantity < 1 || quantity > maxQuantity) {
      this.setStatus('Invalid quantity');
      return;
    }

    const totalCost = quantity * priceEach;
    if (gameState.coins < totalCost) {
      this.setStatus('Not enough coins');
      return;
    }

    // Execute the purchase
    this.buyPlayerItem(listingId, quantity);
    this.closeBuyDialog();
  },

  // Debug function to clear all market data - useful for testing
  clearMarketData() {
    // Clear server market listings
    this.serverMarketListings = [];
    console.log('Cleared all market data');
    this.loadMarketListings('equipment');
    this.loadMarketListings('resources');
    this.loadMyListings();
  },

  // Gold collection system
  createPendingGold(amount, fromPlayer) {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const pendingKey = `pendingGold_${currentPlayer}`;
    let pendingGold = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    
    pendingGold.push({
      id: Date.now() + Math.random(),
      amount: amount,
      fromPlayer: fromPlayer,
      timestamp: new Date().toISOString()
    });
    
    localStorage.setItem(pendingKey, JSON.stringify(pendingGold));
    this.updatePendingGoldDisplay();
    this.showMarketNotification(`${amount} gold ready to collect!`);
  },

  updatePendingGoldDisplay() {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const pendingKey = `pendingGold_${currentPlayer}`;
    const pendingGold = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    
    const totalPending = pendingGold.reduce((sum, gold) => sum + gold.amount, 0);
    const goldCountElement = document.getElementById('pending-gold-count');
    const collectContainer = document.getElementById('pending-gold-container');
    
    if (goldCountElement) {
      goldCountElement.textContent = totalPending;
    }
    
    if (collectContainer) {
      collectContainer.style.display = totalPending > 0 ? 'block' : 'none';
    }

    // Update sell tab badge
    const sellTabBadge = document.querySelector('[onclick="UI.switchMarketTab(\'sell\')"] .notification-badge');
    if (sellTabBadge) {
      sellTabBadge.textContent = totalPending > 0 ? totalPending : '';
      sellTabBadge.style.display = totalPending > 0 ? 'inline' : 'none';
    }
  },

  collectAllGold() {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const pendingKey = `pendingGold_${currentPlayer}`;
    const pendingGold = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    
    if (pendingGold.length === 0) return;
    
    const totalAmount = pendingGold.reduce((sum, gold) => sum + gold.amount, 0);
    
    // Add gold to player's inventory
    if (window.gameState && window.gameState.gold !== undefined) {
      window.gameState.gold += totalAmount;
    }
    
    // Clear pending gold
    localStorage.removeItem(pendingKey);
    
    // Show particle effect
    if (this.particleManager) {
      this.particleManager.goldPickupEffect(totalAmount);
    }
    
    // Play sound
    if (window.AudioManager) {
      window.AudioManager.playSound('goldPickup');
    }
    
    // Show notification
    this.showMarketNotification(`Collected ${totalAmount} gold!`);
    
    // Update displays
    this.updatePendingGoldDisplay();
    if (window.UI && window.UI.updateGoldDisplay) {
      window.UI.updateGoldDisplay();
    }
    
    // Save game
    if (window.SaveManager) {
      window.SaveManager.saveGame();
    }
  },

  showMarketNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'market-notification';
    notification.textContent = message;
    
    // Add to market panel
    const marketPanel = document.getElementById('market-panel');
    if (marketPanel) {
      marketPanel.appendChild(notification);
      
      // Remove after animation
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    }
  },

  loadSellHistory() {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const historyKey = `sellHistory_${currentPlayer}`;
    const pendingSalesKey = `pendingSales_${currentPlayer}`;
    
    const sellHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
    const pendingSales = JSON.parse(localStorage.getItem(pendingSalesKey) || '[]');
    
    const historyContainer = document.getElementById('sell-history-content');
    if (!historyContainer) return;
    
    let content = '';
    
    // Show pending sales first (uncollected)
    const unCollectedSales = pendingSales.filter(sale => !sale.collected);
    if (unCollectedSales.length > 0) {
      content += '<div class="pending-sales-section"><h4>Pending Collections</h4>';
      unCollectedSales.forEach(sale => {
        const date = new Date(sale.timestamp).toLocaleDateString();
        const time = new Date(sale.timestamp).toLocaleTimeString();
        content += `
          <div class="pending-sale-item">
            <div class="sale-item-header">
              <div class="sale-item-info">
                <span class="item-name">${sale.quantity}x ${sale.item}</span>
                <span class="sale-buyer">sold to ${sale.buyerName}</span>
              </div>
              <div class="sale-amount">+${sale.goldAmount} <svg class="coin-icon-small"><use href="#icon-coin"/></svg></div>
            </div>
            <div class="sale-item-footer">
              <span class="sale-date">${date} ${time}</span>
              <button class="collect-sale-btn" onclick="UI.collectSaleCoins('${sale.id}')">
                Collect Coins
              </button>
            </div>
          </div>
        `;
      });
      content += '</div>';
    }
    
    // Show collected sales history
    const collectedSales = pendingSales.filter(sale => sale.collected);
    const allCompletedSales = [...collectedSales, ...sellHistory];
    
    if (allCompletedSales.length > 0) {
      content += '<div class="completed-sales-section"><h4>Sales History</h4>';
      // Sort by date (newest first)
      allCompletedSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      allCompletedSales.forEach(sale => {
        const date = new Date(sale.timestamp).toLocaleDateString();
        const time = new Date(sale.timestamp).toLocaleTimeString();
        const itemName = sale.item || sale.itemName;
        const goldAmount = sale.goldAmount || sale.totalAmount;
        const buyerName = sale.buyerName;
        
        content += `
          <div class="completed-sale-item">
            <div class="sale-item-header">
              <div class="sale-item-info">
                <span class="item-name">${sale.quantity}x ${itemName}</span>
                <span class="sale-buyer">sold to ${buyerName}</span>
              </div>
              <div class="sale-amount collected">+${goldAmount} <svg class="coin-icon-small"><use href="#icon-coin"/></svg></div>
            </div>
            <div class="sale-item-footer">
              <span class="sale-date">${date} ${time}</span>
              <span class="collected-status">✓ Collected</span>
            </div>
          </div>
        `;
      });
      content += '</div>';
    }
    
    if (content === '') {
      content = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No sales yet.</p>';
    }
    
    historyContainer.innerHTML = content;
  },

  addToSellHistory(itemName, quantity, pricePerUnit, buyerName, totalAmount) {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const historyKey = `sellHistory_${currentPlayer}`;
    let sellHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
    
    sellHistory.push({
      id: Date.now(),
      itemName: itemName,
      quantity: quantity,
      pricePerUnit: pricePerUnit,
      buyerName: buyerName,
      totalAmount: totalAmount,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 sales
    if (sellHistory.length > 50) {
      sellHistory = sellHistory.slice(-50);
    }
    
    localStorage.setItem(historyKey, JSON.stringify(sellHistory));
  },

  // Initialize social buttons (no longer needed for desktop buttons)
  initDesktopSocialButtons() {
    // Desktop social buttons removed - only mobile bottom panel buttons remain
    // Chat and market buttons are now in the bottom panel
    console.log('Social buttons now in bottom panel only');
  },

  syncDesktopNotifications() {
    // Desktop buttons removed - no sync needed anymore
    // Only bottom panel chat/market buttons exist now
  },

  // Method for desktop social buttons
  showPanel(panelType) {
    const panels = {
      'chat': document.getElementById('panel-chat'),
      'market': document.getElementById('panel-market')
    };
    
    const buttons = {
      'chat': document.getElementById('toggleChat'),
      'market': document.getElementById('toggleMarket')
    };
    
    
    const panel = panels[panelType];
    const button = buttons[panelType];
    
    if (!panel) return;
    
    // Play sound
    if (window.AudioManager) {
      window.AudioManager.playButtonClick();
    }
    
    // Toggle panel visibility
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    // Update button states
    if (button) {
      button.classList.toggle('active', !isVisible);
    }
    
    // Special handling for chat
    if (panelType === 'chat' && !isVisible) {
      try {
        document.getElementById('chat-input')?.focus?.();
        // Request fresh player list when chat panel opens
        if (window.globalChat && window.globalChat.ws && window.globalChat.ws.readyState === 1) {
          console.log('Requesting fresh player list on chat panel open');
          window.globalChat._send({ type: 'requestPlayers' });
        }
      } catch {}
      
      // Reset unread count when opening chat
      if (this.resetChatUnreadCount) {
        this.resetChatUnreadCount();
      } else {
        if (button) button.classList.remove('has-notification');
      }
    }
    
    // Special handling for market
    if (panelType === 'market' && !isVisible) {
      // Request fresh market data from server when panel opens
      this.requestMarketDataFromServer();
      
      // Also refresh local view
      this.refreshMarketListings();
    }
    
    // Special handling for market
    if (panelType === 'market' && !isVisible) {
      try {
        this.initTestMarket();
      } catch {}
    }
  },

  // Method for desktop social buttons
  showPanel(panelType) {
    const panels = {
      'chat': document.getElementById('panel-chat'),
      'market': document.getElementById('panel-market')
    };
    
    const buttons = {
      'chat': document.getElementById('toggleChat'),
      'market': document.getElementById('toggleMarket')
    };
    
    
    const panel = panels[panelType];
    const button = buttons[panelType];
    
    if (!panel) return;
    
    // Play sound
    if (window.AudioManager) {
      window.AudioManager.playButtonClick();
    }
    
    // Toggle panel visibility
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    // Update button states
    if (button) {
      button.classList.toggle('active', !isVisible);
    }
    
    // Special handling for chat
    if (panelType === 'chat' && !isVisible) {
      try {
        document.getElementById('chat-input')?.focus?.();
        // Request fresh player list when chat panel opens
        if (window.globalChat && window.globalChat.ws && window.globalChat.ws.readyState === 1) {
          console.log('Requesting fresh player list on chat panel open');
          window.globalChat._send({ type: 'requestPlayers' });
        }
      } catch {}
      
      // Reset unread count when opening chat
      if (this.resetChatUnreadCount) {
        this.resetChatUnreadCount();
      } else {
        if (button) button.classList.remove('has-notification');
      }
    }
    
    // Special handling for market
    if (panelType === 'market' && !isVisible) {
      // Request fresh market data from server when panel opens
      this.requestMarketDataFromServer();
      
      // Also refresh local view
      this.refreshMarketListings();
    }
    
    // Special handling for market
    if (panelType === 'market' && !isVisible) {
      try {
        this.initTestMarket();
      } catch {}
    }
  },

  // Check if chat is connected (HTTP mode only)
  isChatConnected() {
    return window.globalChat && window.globalChat.mode === 'http' && window.globalChat._httpStarted;
  },

  // Request market data via direct API call
  async requestMarketDataViaAPI() {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/market/listings`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Market data received via API:', data);
        // Process market data if available
        if (data.listings) {
          this.serverMarketListings = data.listings;
          console.log('Updated server market listings:', this.serverMarketListings.length, 'items');
          // Refresh the current market view
          this.refreshCurrentMarketView();
        }
      } else {
        console.warn('Failed to fetch market data via API:', response.status);
      }
    } catch (error) {
      console.error('Error fetching market data via API:', error);
    }
  },

  // Request market data from server (HTTP-only mode)
  requestMarketDataFromServer() {
    console.log('Requesting market data from server...');
    // Always use direct API call since we're HTTP-only
    this.requestMarketDataViaAPI();
  },

  // Initialize market sync (HTTP-only mode)
  initializeMarketSync() {
    console.log('Initializing market sync...');
    // Request initial market data
    this.requestMarketDataFromServer();
    
    // Set up periodic refresh for market data (since we're using HTTP polling)
    if (!this._marketSyncInitialized) {
      this._marketSyncInitialized = true;
      
      // Refresh market data every 30 seconds
      this._marketRefreshInterval = setInterval(() => {
        console.log('Periodic market data refresh...');
        this.requestMarketDataFromServer();
      }, 30000);
    }
  },

  // Handle item sold notifications
  handleItemSold(msg) {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const { listing, quantity, buyerName } = msg;
    
    // Only process if this player is the seller
    if (listing.seller === currentPlayer) {
      const goldEarned = listing.price * quantity;
      const itemText = quantity === 1 ? listing.item : `${quantity}x ${listing.item}`;
      
      // Add to pending sales collection instead of immediately crediting
      this.addPendingSale(listing.item, quantity, goldEarned, buyerName);
      
      // Show brief notification that an item was sold
      this.showBriefSaleNotification(itemText, buyerName);
      
      // Play sound effect
      if (window.AudioManager) {
        window.AudioManager.playSound('goldPickup');
      }
      
      // Update sell history tab to show new pending sale
      this.loadSellHistory();
    }
  },

  // Add a pending sale to localStorage
  addPendingSale(itemName, quantity, goldAmount, buyerName) {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const pendingSalesKey = `pendingSales_${currentPlayer}`;
    let pendingSales = JSON.parse(localStorage.getItem(pendingSalesKey) || '[]');
    
    const newSale = {
      id: Date.now() + Math.random(),
      item: itemName,
      quantity: quantity,
      goldAmount: goldAmount,
      buyerName: buyerName,
      timestamp: new Date().toISOString(),
      collected: false
    };
    
    pendingSales.push(newSale);
    localStorage.setItem(pendingSalesKey, JSON.stringify(pendingSales));
    
    console.log(`Added pending sale: ${quantity}x ${itemName} for ${goldAmount} coins from ${buyerName}`);
  },

  // Show brief notification that item was sold
  showBriefSaleNotification(itemText, buyerName) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'brief-sale-notification';
    notification.innerHTML = `
      <div class="brief-notification-content">
        <span class="brief-notification-text">${itemText} sold to ${buyerName}!</span>
        <span class="brief-notification-hint">Check Sell History to collect coins</span>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  },

  // Collect coins from a specific sale
  collectSaleCoins(saleId) {
    const currentPlayer = localStorage.getItem('playerName') || 'Unknown';
    const pendingSalesKey = `pendingSales_${currentPlayer}`;
    let pendingSales = JSON.parse(localStorage.getItem(pendingSalesKey) || '[]');
    
    const saleIndex = pendingSales.findIndex(sale => sale.id === saleId);
    if (saleIndex === -1) {
      console.warn('Sale not found for collection');
      return;
    }
    
    const sale = pendingSales[saleIndex];
    if (sale.collected) {
      console.warn('Sale already collected');
      return;
    }
    
    // Add coins to player's account
    if (typeof gameState !== 'undefined' && gameState.coins !== undefined) {
      gameState.coins += sale.goldAmount;
      console.log(`Collected ${sale.goldAmount} coins from sale. New total: ${gameState.coins}`);
      this.updateCoinDisplay();
    }
    
    // Mark sale as collected
    sale.collected = true;
    localStorage.setItem(pendingSalesKey, JSON.stringify(pendingSales));
    
    // Show collection notification
    this.showSaleNotification(`${sale.quantity}x ${sale.item}`, sale.goldAmount, sale.buyerName);
    
    // Refresh sell history display
    this.loadSellHistory();
    
    // Save game with updated coins
    if (window.SaveManager) {
      window.SaveManager.saveNow();
    }
    
    // Play sound effect
    if (window.AudioManager) {
      window.AudioManager.playSound('goldPickup');
    }
  },
  showSaleNotification(itemText, goldEarned, buyerName) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'sale-notification';
    notification.innerHTML = `
      <div class="sale-notification-content">
        <div class="sale-notification-title">Item Sold!</div>
        <div class="sale-notification-item">${itemText}</div>
        <div class="sale-notification-gold">+${goldEarned} <svg class="coin-icon-small"><use href="#icon-coin"/></svg></div>
        <div class="sale-notification-buyer">to ${buyerName}</div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    // Remove after 4 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  },

  // Refresh only the currently visible market view
  refreshCurrentMarketView() {
    const marketPanel = document.getElementById('panel-market');
    
    // Only refresh if market panel is visible
    if (!marketPanel || marketPanel.style.display === 'none') {
      return;
    }
    
    // Get the currently active sub-tab
    const activeSubTab = document.querySelector('.market-sub-tab.active');
    const activeMainTab = document.querySelector('.market-tab.active');
    
    if (!activeSubTab || !activeMainTab) {
      return;
    }
    
    const subTabType = activeSubTab.dataset.subTab;
    const mainTabType = activeMainTab.dataset.tab;
    
    // Only refresh if we're on the buy tab (where listings are displayed)
    if (mainTabType === 'buy') {
      console.log(`Refreshing current market view: ${subTabType}`);
      this.loadMarketListings(subTabType);
      
      // Update listing count status
      const listingCount = (this.serverMarketListings || []).length;
      this.setStatus(`Market updated - ${listingCount} total listings available`);
    }
  },

  // Update chat header to show current username
  updateChatHeader() {
    const chatHeader = document.querySelector('#panel-chat .chat-header h2');
    if (chatHeader) {
      const playerName = localStorage.getItem('playerName') || 'Unknown';
      chatHeader.textContent = `Global Chat - ${playerName}`;
    }
  }
};

// Make UI available globally for onclick handlers
if (typeof window !== 'undefined') {
  window.UI = UI;
}


