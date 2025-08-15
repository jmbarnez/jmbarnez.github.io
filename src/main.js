import { UI } from './ui/UI.js';
import { gameState, loadSavedState } from './state/gameState.js';
import { Inventory } from './features/inventory/index.js';
import { Equipment, setInventory } from './features/equipment/index.js';
import { Exploration } from './features/exploration/index.js';
import { Fishing } from './features/fishing/index.js';
import { AudioManager } from './systems/AudioManager.js';
import { PanelManager } from './ui/PanelManager.js';
import { Skills } from './features/skills/index.js';
import { IdleManager } from './systems/IdleManager.js';
import { SaveManager } from './systems/SaveManager.js';
import { validateConfig } from './config/gameConfig.js';
import { logger } from './utils/logger.js';
import { ErrorHandler } from './utils/errorHandler.js';

function bootGame() {
  // Initialize error handling first
  ErrorHandler.initialize();
  logger.info('Error handler initialized');
  
  // Validate configuration before starting the game
  if (!validateConfig()) {
    logger.error('Configuration validation failed - game may not work correctly');
  }
  
  logger.info('Starting game initialization...');
  
  // Load saved state from server
  loadSavedState().then(() => {
    logger.debug('Initializing UI systems...');
    UI.init();
    try { UI.initChat?.(); } catch {}
    
    logger.debug('Initializing inventory system...');
    Inventory.init();
    setInventory(Inventory);
    
    logger.debug('Initializing equipment system...');
    Equipment.init();
    
    logger.debug('Initializing fishing system...');
    Fishing.init();
    
    logger.debug('Initializing panel management...');
    PanelManager.init();
    
    logger.debug('Initializing skills system...');
    Skills.init();
    
    logger.debug('Starting save manager...');
    try { SaveManager.startAutoSave?.(); } catch {}
    
    logger.debug('Loading audio assets...');
    try { AudioManager.loadGoldPickupSound(); } catch {}
    
    logger.debug('Rendering initial UI...');
    Inventory.render();
    Equipment.updateUI();
    UI.updateAll();
    try { Exploration.stop(); } catch {}
    
    logger.debug('Initializing idle manager...');
    try { IdleManager.init(); } catch {}
    
    // Initialize Minnow as discovered for new players
    try {
      const discovered = JSON.parse(localStorage.getItem('fish_discovered') || '[]');
      if (discovered.length === 0) {
        localStorage.setItem('fish_discovered', JSON.stringify(['Minnow']));
        logger.debug('Initialized Minnow as discovered for new player');
      }
    } catch (error) {
      logger.error('Failed to initialize fish discoveries', error);
    }
    
    logger.info('Game initialization complete!');
    
    // Enhanced auto-save on important events
    try {
      const saveAndExit = () => {
        try { 
          SaveManager.saveNow(); 
          logger.info('Complete game data saved on exit');
        } catch (error) {
          logger.error('Failed to save on exit', error);
        }
      };

      // Save on page unload (closing tab/browser)
      window.addEventListener('beforeunload', (e) => {
        saveAndExit();
        // Show confirmation dialog
        e.preventDefault();
        e.returnValue = 'Your game progress will be saved automatically.';
        return e.returnValue;
      });

      // Save when tab becomes hidden (switching tabs)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { 
          saveAndExit();
        }
      });

      // Save on window focus loss
      window.addEventListener('blur', () => {
        saveAndExit();
      });
    } catch (error) {
      logger.error('Failed to setup auto-save handlers', error);
    }
    
    setInterval(() => { 
      gameState.stats.stamina = Math.min(gameState.stats.staminaMax, gameState.stats.stamina + 0.5); 
      gameState.stats.mana = Math.min(gameState.stats.manaMax, gameState.stats.mana + 0.3); 
      UI.updateStats(); 
      // Trigger debounced save when stats change
      SaveManager.debouncedSave();
    }, 1000);
    
    setInterval(() => UI.updateClock(), 1000);
    const startAmbientOnInteraction = (e) => { AudioManager.startAmbientSounds(); document.removeEventListener('pointerdown', startAmbientOnInteraction); document.removeEventListener('keydown', startAmbientOnInteraction); };
    document.addEventListener('pointerdown', startAmbientOnInteraction, { once: true });
    document.addEventListener('keydown', startAmbientOnInteraction);
  }).catch(error => {
    ErrorHandler.handleError(error, { component: 'main', operation: 'loadSavedState' });
    // Continue with default state if loading fails
    UI.init();
    try { UI.initChat?.(); } catch {}
    Inventory.init();
    setInventory(Inventory);
    Equipment.init();
    PanelManager.init();
    Skills.init();
    try { SaveManager.startAutoSave?.(); } catch {}
    try { AudioManager.loadGoldPickupSound(); } catch {}
    Inventory.render();
    Equipment.updateUI();
    UI.updateAll();
    try { Exploration.stop(); } catch {}
    try { IdleManager.init(); } catch {}
    
    // Initialize Minnow as discovered for new players
    try {
      const discovered = JSON.parse(localStorage.getItem('fish_discovered') || '[]');
      if (discovered.length === 0) {
        localStorage.setItem('fish_discovered', JSON.stringify(['Minnow']));
        logger.debug('Initialized Minnow as discovered for new player (fallback)');
      }
    } catch (error) {
      logger.error('Failed to initialize fish discoveries (fallback)', error);
    }
  });
}

function initGame() {
  // Initialize theme early (before login screen)
  const savedTheme = localStorage.getItem('gameTheme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  
  // Initialize login theme toggle button
  const loginThemeBtn = document.getElementById('loginThemeToggle');
  if (loginThemeBtn) {
    loginThemeBtn.title = savedTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    loginThemeBtn.setAttribute('aria-label', savedTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme');
  }
  
  // Check for existing valid token
  const existingToken = localStorage.getItem('authToken');
  console.log('Existing authToken:', existingToken ? 'present' : 'not found');
  
  if (existingToken) {
    // Token exists, try to validate it with the server
    console.log('Found existing token, validating with server...');
    validateTokenAndBoot(existingToken);
  } else {
    // No token, show login screen
    console.log('No token found, showing login screen...');
    showLoginScreen();
  }
}

async function validateTokenAndBoot(token) {
  try {
    const authUrl = '/api/me';
    
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      // Token is valid, boot the game
      console.log('Token validated successfully, booting game...');
      document.body.classList.remove('login-mode');
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.hidden = true;
      bootGame();
    } else {
      // Token invalid, clear it and show login
      console.log('Token validation failed, clearing token and showing login...');
      localStorage.removeItem('authToken');
      localStorage.removeItem('playerName');
      showLoginScreen();
    }
  } catch (error) {
    console.error('Token validation error:', error);
    // Network error, clear token and show login
    localStorage.removeItem('authToken');
    localStorage.removeItem('playerName');
    showLoginScreen();
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById('login-screen');
  if (!loginScreen) {
    console.error('Login screen element not found!');
    return;
  }
  
  console.log('Login screen found, making it visible...');
  loginScreen.hidden = false;
  document.body.classList.add('login-mode');
  
  console.log('Login screen should now be visible');
  
  // Check server status when login screen opens
  checkServerStatus();
  
  // Initialize changelog functionality
  initializeChangelog();
  
  const status = document.getElementById('ls-status');
  const setStatus = (t) => { if (status) status.textContent = t; };
  
  // Form elements
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authTitle = document.getElementById('auth-title');
  
  // Form switching
  const showLoginForm = () => {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    authTitle.textContent = 'Welcome Back';
    setStatus('');
  };
  
  const showRegisterForm = () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    authTitle.textContent = 'Create Account';
    setStatus('');
  };
  
  // Get credentials functions
  const getLoginCreds = () => ({ 
    username: document.getElementById('login-username')?.value?.trim(), 
    password: document.getElementById('login-password')?.value || '' 
  });
  
  const getRegisterCreds = () => ({ 
    username: document.getElementById('register-username')?.value?.trim(), 
    password: document.getElementById('register-password')?.value || '',
    confirmPassword: document.getElementById('register-confirm')?.value || ''
  });
  
  const authFetch = async (path, body) => {
    const currentHost = window.location.hostname;
    let baseUrl;
    
    // If accessing via ngrok, use the same domain (Vite will proxy /api requests)
    if (currentHost.includes('ngrok-free.app') || currentHost.includes('ngrok.app')) {
      baseUrl = window.location.origin;
    } else {
      baseUrl = window.location.origin;
    }
    
    const url = `${baseUrl}${path}`;
    console.log('Making auth request to:', url);
    console.log('Request body:', body);
    
    const res = await fetch(url, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(body) 
    });
    
    console.log('Response status:', res.status);
    const responseData = await res.json();
    console.log('Response data:', responseData);
    return responseData;
  };
  
  const onLogin = async () => {
    const c = getLoginCreds(); 
    if (!c.username || !c.password) return setStatus('Enter username and password');
    setStatus('Signing in...');
    console.log('Attempting login with:', { username: c.username, password: '***' });
    try {
      const out = await authFetch('/api/login', c);
      console.log('Login response:', out);
      if (out?.token) {
        localStorage.setItem('authToken', out.token);
        localStorage.setItem('playerName', c.username);
        setStatus('Welcome back! Loading your game...');
        
        // Hide login screen and boot game directly instead of reloading
        setTimeout(() => {
          document.body.classList.remove('login-mode');
          const loginScreen = document.getElementById('login-screen');
          if (loginScreen) loginScreen.hidden = true;
          bootGame();
        }, 500);
      } else {
        console.error('Login failed:', out?.error || 'No token in response');
        setStatus(out?.error || 'Login failed');
      }
    } catch (error) { 
      console.error('Login error:', error);
      setStatus('Connection failed - check if servers are running'); 
    }
  };
  
  const onRegister = async () => {
    const c = getRegisterCreds(); 
    if (!c.username || !c.password || !c.confirmPassword) {
      return setStatus('Please fill in all fields');
    }
    if (c.username.length < 3) {
      return setStatus('Username must be at least 3 characters');
    }
    if (c.password.length < 4) {
      return setStatus('Password must be at least 4 characters');
    }
    if (c.password !== c.confirmPassword) {
      return setStatus('Passwords do not match');
    }
    setStatus('Creating account...');
    try {
      const out = await authFetch('/api/register', { username: c.username, password: c.password });
      if (out?.token) {
        localStorage.setItem('authToken', out.token);
        localStorage.setItem('playerName', c.username);
        setStatus('Account created! Starting your adventure...');
        
        // Hide login screen and boot game directly instead of reloading
        setTimeout(() => {
          document.body.classList.remove('login-mode');
          const loginScreen = document.getElementById('login-screen');
          if (loginScreen) loginScreen.hidden = true;
          bootGame();
        }, 500);
      } else setStatus(out?.error || 'Registration failed');
    } catch { setStatus('Connection failed - check if servers are running'); }
  };
  
  // Event listeners - remove existing ones first to prevent duplicates
  document.getElementById('show-register')?.removeEventListener('click', showRegisterForm);
  document.getElementById('show-login')?.removeEventListener('click', showLoginForm);
  document.getElementById('login-submit')?.removeEventListener('click', onLogin);
  document.getElementById('register-submit')?.removeEventListener('click', onRegister);
  
  document.getElementById('show-register')?.addEventListener('click', showRegisterForm);
  document.getElementById('show-login')?.addEventListener('click', showLoginForm);
  document.getElementById('login-submit')?.addEventListener('click', onLogin);
  document.getElementById('register-submit')?.addEventListener('click', onRegister);
  
  // Enter key handling
  document.getElementById('login-password')?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') onLogin(); 
  });
  document.getElementById('register-confirm')?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') onRegister(); 
  });
  
  // Login screen controls
  document.getElementById('loginThemeToggle')?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('gameTheme', next);
    
    // Update button title
    const btn = document.getElementById('loginThemeToggle');
    if (btn) {
      btn.title = next === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
      btn.setAttribute('aria-label', next === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme');
    }
  });
  
  document.getElementById('loginMuteToggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const svg = btn.querySelector('svg use');
    const isMuted = btn.classList.contains('muted');
    if (isMuted) {
      btn.classList.remove('muted');
      btn.title = 'Mute Music';
      svg.setAttribute('href', '#icon-volume');
      // Unmute logic for login music (to be implemented later)
    } else {
      btn.classList.add('muted');
      btn.title = 'Unmute Music';
      svg.setAttribute('href', '#icon-volume-mute');
      // Mute logic for login music (to be implemented later)
    }
  });
}

document.addEventListener('DOMContentLoaded', initGame);

// Server status checking function
async function checkServerStatus() {
  const updateStatus = (elementId, status, text) => {
    const indicator = document.getElementById(elementId);
    if (!indicator) return;
    
    const dot = indicator.querySelector('.status-dot');
    const textEl = indicator.querySelector('.status-text');
    
    // Remove existing status classes
    dot.classList.remove('status-online', 'status-offline', 'status-checking');
    dot.classList.add(`status-${status}`);
    textEl.textContent = text;
  };

  // Check Web Server (always online if we can load the page)
  updateStatus('webStatus', 'online', 'Connected');

  // Check Auth Server
  try {
    updateStatus('authServerStatus', 'checking', 'Checking...');
    const authUrl = '/api/me';
    
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    
    // We expect a 401 response for invalid token, which means server is working
    if (response.status === 401 || response.status === 200) {
      updateStatus('authServerStatus', 'online', 'Connected');
    } else {
      updateStatus('authServerStatus', 'offline', 'Error');
    }
  } catch (error) {
    console.error('Auth server check failed:', error);
    updateStatus('authServerStatus', 'offline', 'Offline');
  }

  // Check Chat Server
  try {
    updateStatus('chatServerStatus', 'checking', 'Checking...');
    
    const currentHost = window.location.hostname;
    const urls = currentHost.includes('ngrok') 
      ? [`ws://${currentHost}/ws`, `wss://${currentHost}/ws`]
      : [`ws://${currentHost}:3001`, `ws://localhost:3001`];
    
    let connected = false;
    
    for (const url of urls) {
      try {
        const ws = new WebSocket(url);
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Connection timeout'));
          }, 3000);
          
          ws.onopen = () => {
            clearTimeout(timeout);
            connected = true;
            ws.close();
            resolve();
          };
          
          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          };
        });
        
        if (connected) break;
      } catch (e) {
        // Try next URL
      }
    }
    
    if (connected) {
      updateStatus('chatServerStatus', 'online', 'Connected');
    } else {
      updateStatus('chatServerStatus', 'offline', 'Offline');
    }
  } catch (error) {
    console.error('Chat server check failed:', error);
    updateStatus('chatServerStatus', 'offline', 'Offline');
  }
}

function initializeChangelog() {
  const changelogToggle = document.getElementById('changelog-toggle');
  const changelogPanel = document.getElementById('changelog-panel');
  const changelogClose = document.getElementById('changelog-close');
  
  if (changelogToggle && changelogPanel) {
    changelogToggle.addEventListener('click', () => {
      console.log('Changelog button clicked');
      changelogPanel.style.display = 'block';
    });
  } else {
    console.log('Changelog elements not found:', { changelogToggle, changelogPanel });
  }
  
  if (changelogClose && changelogPanel) {
    changelogClose.addEventListener('click', () => {
      changelogPanel.style.display = 'none';
    });
  }
  
  // Make changelog panel draggable
  if (changelogPanel) {
    const header = changelogPanel.querySelector('.changelog-header');
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    // Load saved position
    const savedPos = localStorage.getItem('changelog-position');
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        changelogPanel.style.left = `${x}px`;
        changelogPanel.style.top = `${y}px`;
        changelogPanel.style.transform = 'none';
      } catch (e) {
        console.log('Error loading changelog position:', e);
      }
    }
    
    if (header) {
      header.addEventListener('mousedown', startDrag);
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
      
      // Touch support for mobile
      header.addEventListener('touchstart', startDrag, { passive: false });
      document.addEventListener('touchmove', drag, { passive: false });
      document.addEventListener('touchend', stopDrag);
    }
    
    function startDrag(e) {
      // Don't drag if clicking on the close button
      if (e.target.closest('.changelog-close-btn')) return;
      
      isDragging = true;
      header.style.cursor = 'grabbing';
      changelogPanel.classList.add('dragging');
      
      const touch = e.touches ? e.touches[0] : e;
      const rect = changelogPanel.getBoundingClientRect();
      
      startX = touch.clientX;
      startY = touch.clientY;
      initialX = rect.left;
      initialY = rect.top;
      
      e.preventDefault();
    }
    
    function drag(e) {
      if (!isDragging) return;
      
      const touch = e.touches ? e.touches[0] : e;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      
      let newX = initialX + deltaX;
      let newY = initialY + deltaY;
      
      // Keep panel within viewport bounds
      const panelRect = changelogPanel.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      newX = Math.max(0, Math.min(newX, viewportWidth - panelRect.width));
      newY = Math.max(0, Math.min(newY, viewportHeight - panelRect.height));
      
      changelogPanel.style.left = `${newX}px`;
      changelogPanel.style.top = `${newY}px`;
      changelogPanel.style.transform = 'none';
      
      e.preventDefault();
    }
    
    function stopDrag() {
      if (!isDragging) return;
      
      isDragging = false;
      header.style.cursor = 'grab';
      changelogPanel.classList.remove('dragging');
      
      // Save position
      const rect = changelogPanel.getBoundingClientRect();
      localStorage.setItem('changelog-position', JSON.stringify({
        x: rect.left,
        y: rect.top
      }));
    }
  }
  
  // Close changelog panel with ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && changelogPanel && changelogPanel.style.display === 'block') {
      changelogPanel.style.display = 'none';
    }
  });
  
  // Close changelog panel when clicking outside
  if (changelogPanel) {
    changelogPanel.addEventListener('click', (e) => {
      if (e.target === changelogPanel) {
        changelogPanel.style.display = 'none';
      }
    });
  }
}


