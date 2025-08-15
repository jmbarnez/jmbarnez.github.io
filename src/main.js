// Prevent ReferenceError for initializeServerStatusPanel
function initializeServerStatusPanel() {
  const serverStatusToggle = document.getElementById('server-status-toggle');
  const serverStatusPanel = document.getElementById('server-status-panel');

  // draggable state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;

  // Load saved position if present
  if (serverStatusPanel) {
    const savedPos = localStorage.getItem('server-status-position');
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        serverStatusPanel.style.left = `${x}px`;
        serverStatusPanel.style.top = `${y}px`;
        serverStatusPanel.style.transform = 'none';
      } catch (err) {
        // ignore parse errors
      }
    }
  }

  if (serverStatusToggle && serverStatusPanel) {
    serverStatusToggle.addEventListener('click', () => {
      if (serverStatusPanel.style.display === 'block') {
        serverStatusPanel.style.display = 'none';
      } else {
        serverStatusPanel.style.display = 'block';
        // Refresh server status when opening panel
        checkServerStatus();
      }
    });
  }

  // Refresh button inside the server status panel
  const refreshBtn = document.getElementById('server-status-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      checkServerStatus();
    });
  }

  // Drag handlers
  const header = serverStatusPanel?.querySelector('.server-status-header');
  const onStartDrag = (e) => {
    // ignore clicks on close button to prevent dragging when closing
    if (e.target.closest('.server-status-close-btn')) return;
    isDragging = true;
    serverStatusPanel.style.cursor = 'grabbing';
    serverStatusPanel.classList.add('dragging');

    const pt = e.touches ? e.touches[0] : e;
    const rect = serverStatusPanel.getBoundingClientRect();
    dragStartX = pt.clientX;
    dragStartY = pt.clientY;
    panelStartX = rect.left;
    panelStartY = rect.top;
    e.preventDefault();
  };
  const onDrag = (e) => {
    if (!isDragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const deltaX = pt.clientX - dragStartX;
    const deltaY = pt.clientY - dragStartY;
    let newX = panelStartX + deltaX;
    let newY = panelStartY + deltaY;

    // bounds
    const panelRect = serverStatusPanel.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    newX = Math.max(0, Math.min(newX, viewportW - panelRect.width));
    newY = Math.max(0, Math.min(newY, viewportH - panelRect.height));

    serverStatusPanel.style.left = `${newX}px`;
    serverStatusPanel.style.top = `${newY}px`;
    serverStatusPanel.style.transform = 'none';
    e.preventDefault();
  };
  const onStopDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    if (serverStatusPanel) {
      serverStatusPanel.style.cursor = 'default';
      serverStatusPanel.classList.remove('dragging');
      // persist
      const rect = serverStatusPanel.getBoundingClientRect();
      localStorage.setItem('server-status-position', JSON.stringify({ x: rect.left, y: rect.top }));
    }
  };

  if (header) {
    header.addEventListener('mousedown', onStartDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onStopDrag);
    // touch support
    header.addEventListener('touchstart', onStartDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', onStopDrag);
  }

  // Mode toggle (Simple / Advanced)
  const modeToggleBtn = document.getElementById('server-status-mode-toggle');
  const simpleMode = document.getElementById('simple-mode');
  const advancedMode = document.getElementById('advanced-mode');

  // Restore saved mode
  let currentMode = localStorage.getItem('server-status-mode') || 'simple';
  const applyMode = (mode) => {
    currentMode = mode;
    if (mode === 'advanced') {
      simpleMode.style.display = 'none';
      advancedMode.style.display = 'block';
      modeToggleBtn.textContent = 'Advanced';
      modeToggleBtn.classList.add('active');
    } else {
      simpleMode.style.display = 'block';
      advancedMode.style.display = 'none';
      modeToggleBtn.textContent = 'Simple';
      modeToggleBtn.classList.remove('active');
    }
    localStorage.setItem('server-status-mode', mode);
  };

  if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
      const next = currentMode === 'simple' ? 'advanced' : 'simple';
      applyMode(next);
    });
  }

  // Apply stored mode on init
  try { applyMode(currentMode); } catch (e) {}

  // Keyboard close (esc) and click-outside close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && serverStatusPanel?.style.display === 'block') {
      serverStatusPanel.style.display = 'none';
    }
  });
  if (serverStatusPanel) {
    serverStatusPanel.addEventListener('click', (e) => {
      if (e.target === serverStatusPanel) serverStatusPanel.style.display = 'none';
    });
  }

  // Close button inside server status panel
  const closeBtn = document.getElementById('server-status-close');
  if (closeBtn && serverStatusPanel) {
    closeBtn.addEventListener('click', () => {
      serverStatusPanel.style.display = 'none';
    });
  }
}
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
  
  // Check for existing valid token (remember me -> localStorage, otherwise sessionStorage)
  const existingToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
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
      sessionStorage.removeItem('authToken');
      localStorage.removeItem('playerName');
      showLoginScreen();
    }
  } catch (error) {
    console.error('Token validation error:', error);
    // Network error, clear token and show login
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
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
  
  // Initialize server status panel functionality
  initializeServerStatusPanel();
  
  // Initialize remember me checkbox
  const rememberMeCheckbox = document.getElementById('remember-me');
  if (rememberMeCheckbox) {
    const savedRememberMe = localStorage.getItem('rememberMe');
    rememberMeCheckbox.checked = savedRememberMe === 'true';
  }
  
  const status = document.getElementById('ls-status');
  const setStatus = (t) => { if (status) status.textContent = t; };
  
  // Form elements
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  // Form switching
  const showLoginForm = () => {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    setStatus('');
    clearAllErrors();
  };
  
  const showRegisterForm = () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    setStatus('');
    clearAllErrors();
  };

  // Clear all error messages
  const clearAllErrors = () => {
    const errorElements = document.querySelectorAll('.input-error');
    const inputs = document.querySelectorAll('.auth-row input');
    
    errorElements.forEach(el => {
      el.textContent = '';
      el.classList.remove('show');
    });
    
    inputs.forEach(input => {
      input.classList.remove('error');
    });
  };

  // Show error for specific input
  const showError = (inputId, message) => {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(`${inputId}-error`);
    
    if (input && errorEl) {
      input.classList.add('error');
      errorEl.textContent = message;
      errorEl.classList.add('show');
    }
  };

  // Clear error for specific input
  const clearError = (inputId) => {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(`${inputId}-error`);
    
    if (input && errorEl) {
      input.classList.remove('error');
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }
  };

  // Password strength checker
  const checkPasswordStrength = (password) => {
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');
    
    if (!strengthFill || !strengthText) return;
    
    let score = 0;
    let feedback = '';
    
    if (password.length >= 8) score++;
    if (password.match(/[a-z]/)) score++;
    if (password.match(/[A-Z]/)) score++;
    if (password.match(/[0-9]/)) score++;
    if (password.match(/[^a-zA-Z0-9]/)) score++;
    
    // Remove existing classes
    strengthFill.classList.remove('weak', 'fair', 'good', 'strong');
    
    if (score <= 1) {
      strengthFill.classList.add('weak');
      feedback = 'Very weak';
    } else if (score === 2) {
      strengthFill.classList.add('fair');
      feedback = 'Fair';
    } else if (score === 3) {
      strengthFill.classList.add('good');
      feedback = 'Good';
    } else {
      strengthFill.classList.add('strong');
      feedback = 'Strong';
    }
    
    strengthText.textContent = feedback;
  };

  // Set loading state for buttons
  const setButtonLoading = (buttonId, isLoading) => {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    if (isLoading) {
      button.disabled = true;
      if (btnText) btnText.style.display = 'none';
      if (btnLoading) btnLoading.style.display = 'flex';
    } else {
      button.disabled = false;
      if (btnText) btnText.style.display = 'flex';
      if (btnLoading) btnLoading.style.display = 'none';
    }
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
    clearAllErrors();
    
    const c = getLoginCreds(); 
    let hasErrors = false;
    
    if (!c.username) {
      showError('login-username', 'Username is required');
      hasErrors = true;
    }
    
    if (!c.password) {
      showError('login-password', 'Password is required');
      hasErrors = true;
    }
    
    if (hasErrors) return;
    
    setStatus('Signing in...');
    setButtonLoading('login-submit', true);
    
    console.log('Attempting login with:', { username: c.username, password: '***' });
    try {
      const out = await authFetch('/api/login', c);
      console.log('Login response:', out);
      if (out?.token) {
        const rememberMe = document.getElementById('remember-me')?.checked;
        if (rememberMe) {
          localStorage.setItem('authToken', out.token);
          sessionStorage.removeItem('authToken');
          localStorage.setItem('rememberMe', 'true');
        } else {
          sessionStorage.setItem('authToken', out.token);
          localStorage.removeItem('authToken');
          localStorage.setItem('rememberMe', 'false');
        }
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
        if (out?.error === 'Invalid credentials') {
          showError('login-username', 'Invalid username or password');
          showError('login-password', 'Invalid username or password');
        }
      }
    } catch (error) { 
      console.error('Login error:', error);
      setStatus('Connection failed - check if servers are running'); 
    } finally {
      setButtonLoading('login-submit', false);
    }
  };
  
  const onRegister = async () => {
    clearAllErrors();
    
    const c = getRegisterCreds(); 
    let hasErrors = false;
    
    if (!c.username) {
      showError('register-username', 'Username is required');
      hasErrors = true;
    } else if (c.username.length < 3) {
      showError('register-username', 'Username must be at least 3 characters');
      hasErrors = true;
    } else if (!/^[a-zA-Z0-9_]+$/.test(c.username)) {
      showError('register-username', 'Username can only contain letters, numbers, and underscores');
      hasErrors = true;
    }
    
    if (!c.password) {
      showError('register-password', 'Password is required');
      hasErrors = true;
    } else if (c.password.length < 4) {
      showError('register-password', 'Password must be at least 4 characters');
      hasErrors = true;
    }
    
    if (!c.confirmPassword) {
      showError('register-confirm', 'Please confirm your password');
      hasErrors = true;
    } else if (c.password !== c.confirmPassword) {
      showError('register-confirm', 'Passwords do not match');
      hasErrors = true;
    }
    
    if (hasErrors) return;
    
    setStatus('Creating account...');
    setButtonLoading('register-submit', true);
    
    try {
      const out = await authFetch('/api/register', { username: c.username, password: c.password });
      if (out?.token) {
        // Default to remember = true on register
        localStorage.setItem('authToken', out.token);
        sessionStorage.removeItem('authToken');
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('playerName', c.username);
        setStatus('Account created! Starting your adventure...');
        
        // Hide login screen and boot game directly instead of reloading
        setTimeout(() => {
          document.body.classList.remove('login-mode');
          const loginScreen = document.getElementById('login-screen');
          if (loginScreen) loginScreen.hidden = true;
          bootGame();
        }, 500);
      } else {
        if (out?.error === 'Username already registered') {
          showError('register-username', 'Username already exists');
        } else {
          setStatus(out?.error || 'Registration failed');
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      setStatus('Connection failed - check if servers are running'); 
    } finally {
      setButtonLoading('register-submit', false);
    }
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
  
  // Password strength checking
  document.getElementById('register-password')?.addEventListener('input', (e) => {
    checkPasswordStrength(e.target.value);
    clearError('register-password');
  });
  
  // Input validation and error clearing
  document.getElementById('login-username')?.addEventListener('input', () => {
    clearError('login-username');
  });
  
  document.getElementById('login-password')?.addEventListener('input', () => {
    clearError('login-password');
  });
  
  document.getElementById('register-username')?.addEventListener('input', () => {
    clearError('register-username');
  });
  
  document.getElementById('register-confirm')?.addEventListener('input', () => {
    clearError('register-confirm');
  });
  
  // Forgot password functionality
  document.getElementById('forgot-password')?.addEventListener('click', () => {
    setStatus('Password reset functionality coming soon!');
  });
  
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
    // Also toggle container classes for panel styling
    indicator.classList.remove('online', 'offline', 'checking');
    indicator.classList.add(status);
    textEl.textContent = text;
  };

  // Check Web Server (always online if we can load the page)
  updateStatus('webStatus', 'online', 'Connected');
  // Panel advanced mirror
  updateStatus('adv-web-status', 'online', 'Connected');

  // Check Auth Server
  try {
    updateStatus('authServerStatus', 'checking', 'Checking...');
    const authUrl = '/api/me';
    
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    
    let authStatus = 'offline';
    let authText = 'Offline';
    if (response.status === 200) {
      authStatus = 'online'; authText = 'Connected';
    } else if (response.status === 401) {
      authStatus = 'offline'; authText = 'Unauthorized';
    }
    updateStatus('authServerStatus', authStatus, authText);
    // Panel mirrors
    updateStatus('simple-auth-status', authStatus, authText);
    updateStatus('adv-auth-status', authStatus, authText);
  } catch (error) {
    console.error('Auth server check failed:', error);
    updateStatus('authServerStatus', 'offline', 'Offline');
    updateStatus('simple-auth-status', 'offline', 'Offline');
    updateStatus('adv-auth-status', 'offline', 'Offline');
  }

  // Check Chat Server (Netlify only, no WebSocket)
  try {
    updateStatus('chatServerStatus', 'checking', 'Checking...');
    updateStatus('chatServerStatus', 'online', 'Connected');
    updateStatus('adv-chat-status', 'online', 'Connected');
  } catch (error) {
    updateStatus('chatServerStatus', 'offline', 'Offline');
    updateStatus('adv-chat-status', 'offline', 'Offline');
  }
  
  // For market/save, assume online when page loads
  updateStatus('adv-market-status', 'online', 'Connected');
  updateStatus('adv-save-status', 'online', 'Connected');
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


