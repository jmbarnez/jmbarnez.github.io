import { auth } from '../utils/firebaseClient.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { getExpForLevel } from '../utils/math.js';
import { playHoverSound, playClickSound } from '../utils/sfx.js';
import { makeDraggable } from '../utils/draggable.js';
// Legacy explore spawns removed; items now spawn in area game
import { setMuted, isMuted } from '../utils/sfx.js';
import { gameState } from '../app/state.js';
import { initInventory, renderInventory } from './inventory.js';
import { initDragDrop } from './dragDrop.js';
import { initAreaGame } from '../game/core.js'; // Import initAreaGame
import { onPlayerDataChange, ensurePlayerDoc, onChatMessages, updatePlayerOnlineStatus, onOnlinePlayersChange } from '../services/firestoreService.js';
import { playerService } from '../services/playerService.js';
import { initRealtimePresence } from '../utils/presence.js';
import { showTypingIndicator, showMessageWithTimeout, hideChatBubble, showPlayerMessage, hidePlayerBubble, showPlayerTyping } from '../game/character.js';
import { experienceManager } from '../game/experienceManager.js';
import { updateAreaPlayer } from '../services/realtimePosition.js';
import { worldToScreenCoords } from '../utils/math.js';
import { createPixelIconForItem } from '../data/pixelIcons.js';
import { updateCoinDisplay } from '../ui/inventory.js'; // AI: Import for updating coin display in inventory.
import { sendGlobalMessage, setTypingStatus } from '../game/ui.js'; // AI: Import global message and typing status functions.
import { multiplayerManager } from '../game/multiplayerManager.js';
import { initSettingsPanel } from './settings.js';
import { initSkillsPanel } from './skills.js';
import { ensureNotificationContainer, showDesktopNotification } from '../utils/domUtils.js';
// import { SPAWN_CHANCE_PER_TICK, EXPLORE_TICK_INTERVAL_MS } from './utils/constants.js';
import { coerceTs, formatChatTime } from '../utils/math.js';

function initPixelIcons() {
  const iconElements = document.querySelectorAll('[data-icon]');
  iconElements.forEach(el => {
    const iconId = el.dataset.icon;
    if (iconId) {
      el.innerHTML = '';
      // AI: Adjust icon size based on parent element's dimensions.
      const size = el.classList.contains('w-8') ? 32 : el.classList.contains('w-6') ? 24 : 16;
      const canvas = createPixelIconForItem({ id: iconId }, { cssSize: size, scale: 2 });
      el.appendChild(canvas);
    }
  });
}

// Global fallback toggle for debug panel (safe to call before initDesktopScreen runs)
window.toggleDebugPanel = function toggleDebugPanelFallback() {
  try {
    const el = document.getElementById('debug-panel-container');
    if (!el) return;
    const isHidden = el.classList.contains('hidden');
    el.classList.toggle('hidden');
    if (!isHidden) {
      const canvas = document.getElementById('area-canvas');
      if (canvas) setTimeout(() => canvas.focus(), 50);
    }
    if (typeof window.updateUIOpenState === 'function') window.updateUIOpenState();
  } catch (e) {
    // ignore
  }
};

export function initDesktopScreen() {
  // --- DOM Element Lookups ---
  // AI: The status bar and bottom bar have been removed for a cleaner UI.
  const desktopScreen = document.getElementById('desktop-screen');
  const inventoryGrid = document.getElementById('inventory-grid');
  const allButtons = document.querySelectorAll('button');
  // AI: Declare skillsPanel and equipmentPanel here to ensure they are accessible throughout initDesktopScreen.
  const skillsPanel = document.getElementById('skills-panel');
  const equipmentPanel = document.getElementById('equipment-panel');

  // --- Module Initialization ---
  initPixelIcons(); // AI: Initialize all pixel icons, including new skill, equipment, and market icons.
  initInventory(inventoryGrid, desktopScreen);
  initDragDrop(desktopScreen);
  initSettingsPanel();
  // Initialize skills panel UI to sync with experience manager
  initSkillsPanel();
  // No DOM-based item highlights; items are drawn in canvas
  // Initialize robust RTDB presence (mirrored to Firestore by CFN)
  initRealtimePresence();
  
  // AI: Initialize coin icon for the inventory panel's coin pouch.
  const inventoryCoinIconContainer = document.getElementById('inventory-coin-icon-container');
  if (inventoryCoinIconContainer && inventoryCoinIconContainer.children.length === 0) {
    const coinIcon = createPixelIconForItem({ id: 'coin' }, { cssSize: 14, scale: 1 });
    inventoryCoinIconContainer.appendChild(coinIcon);
  }

  // --- Event Listeners ---
  allButtons.forEach(button => {
    button.addEventListener('mouseover', playHoverSound);
    button.addEventListener('click', playClickSound);
  });

  // Exploring feature removed; spawns handled by area mini-game beach

  // --- UI Panels ---
  const mainPanelContainer = document.getElementById('main-panel-container');
  const mainPanelToggle = document.getElementById('main-panel-toggle');
  const mainPanelClose = document.getElementById('main-panel-close');

  // AI: Tab switching functionality for main panel
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(targetTab) {
    // AI: Remove active class from all tab buttons and hide all tab content
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // AI: Add active class to clicked button and show corresponding content
    const activeButton = document.querySelector(`[data-tab="${targetTab}"]`);
    const activeContent = document.getElementById(`${targetTab}-panel`);
    
    if (activeButton) {
      activeButton.classList.add('active');
    }
    if (activeContent) {
      activeContent.classList.remove('hidden');
    }
  }

  // AI: Add click event listeners to all tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const targetTab = e.target.getAttribute('data-tab');
      if (targetTab) {
        switchTab(targetTab);
      }
    });
  });

  // AI: Function to toggle the main panel's visibility with focus management
  const toggleMainPanel = () => {
    if (mainPanelContainer) {
      const isHidden = mainPanelContainer.classList.contains('hidden');
      mainPanelContainer.classList.toggle('hidden');

      // AI: Focus management - ensure game canvas gets focus when panels close
      if (!isHidden) { // Panel was visible, now hiding
        const canvas = document.getElementById('area-canvas');
        if (canvas) {
          setTimeout(() => canvas.focus(), 50); // Brief delay to ensure DOM update
        }
      }

      updateUIOpenState(); // Update global UI state
    }
  };

  // AI: Global function to toggle main panel (accessible from game core)
  window.toggleMainPanel = toggleMainPanel;

  // AI: Debug panel functionality
  const debugPanelContainer = document.getElementById('debug-panel-container');
  const debugPanelClose = document.getElementById('debug-panel-close');
  const debugClearConsole = document.getElementById('debug-clear-console');
  const debugGC = document.getElementById('debug-gc');
  const debugReload = document.getElementById('debug-reload');

  // AI: Global function to toggle debug panel (renamed from update panel)
  const toggleDebugPanel = () => {
    if (debugPanelContainer) {
      const isHidden = debugPanelContainer.classList.contains('hidden');
      debugPanelContainer.classList.toggle('hidden');

      // AI: Focus management - return focus to game when closing
      if (!isHidden) {
        const canvas = document.getElementById('area-canvas');
        if (canvas) {
          setTimeout(() => canvas.focus(), 50);
        }
      }

      updateUIOpenState();
      // Re-apply canvas DPR/resolution in case layout changed while panel was open
      try {
        if (window.applyDPRSetting) window.applyDPRSetting();
      } catch (_) {}
      // Force a reflow so canvas bounding rect updates immediately
      void document.body.getBoundingClientRect();
    }
  };

  // AI: Make debug panel toggle global
  window.toggleDebugPanel = toggleDebugPanel;

  // AI: Close button handler
  if (debugPanelClose) {
    debugPanelClose.onclick = toggleDebugPanel;
  }

  // AI: Update action handlers
  if (debugClearConsole) {
    debugClearConsole.onclick = () => {
      const consoleDiv = document.getElementById('debug-console');
      if (consoleDiv) {
        consoleDiv.innerHTML = '<div class="text-slate-500">Console cleared...</div>';
      }
    };
  }

  if (debugGC) {
    debugGC.onclick = () => {
      if (window.gc) {
        window.gc();
        console.log('Manual garbage collection triggered');
      } else {
        console.log('Manual GC not available (use Chrome with --enable-gc-experiment)');
      }
    };
  }

  if (debugReload) {
    debugReload.onclick = () => {
      window.location.reload();
    };
  }

  // AI: Console logging capture for debug panel
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  // AI: Function to add message to debug console
  const addDebugMessage = (type, ...args) => {
    const consoleDiv = document.getElementById('debug-console');
    if (!consoleDiv) return;

    const timestamp = new Date().toLocaleTimeString();
    const message = args.join(' ');
    const maxMessages = 20; // Keep only last 20 messages

    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `text-[10px] ${type === 'error' ? 'text-red-400' : type === 'warn' ? 'text-yellow-400' : 'text-slate-300'}`;
    messageEl.textContent = `[${timestamp}] ${message}`;

    // Add to console
    consoleDiv.appendChild(messageEl);

    // Remove old messages if too many
    while (consoleDiv.children.length > maxMessages) {
      consoleDiv.removeChild(consoleDiv.firstChild);
    }

    // Auto-scroll to bottom
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  };

  // AI: Override console methods to capture debug output
  console.log = (...args) => {
    originalConsoleLog.apply(console, args);
    addDebugMessage('log', ...args);
  };

  console.warn = (...args) => {
    originalConsoleWarn.apply(console, args);
    addDebugMessage('warn', ...args);
  };

  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    addDebugMessage('error', ...args);
  };

  // AI: Add initial debug message
  setTimeout(() => {
    console.log('Debug panel initialized - press F3 to toggle');
  }, 1000);

  // Event listener for the main toggle button
  if (mainPanelToggle) {
    mainPanelToggle.onclick = toggleMainPanel;
  }

  // AI: Event listener for the close button with focus management
  if (mainPanelClose) {
    mainPanelClose.onclick = () => {
      if (mainPanelContainer) {
        mainPanelContainer.classList.add('hidden');
        // AI: Return focus to game canvas when panel is closed
        const canvas = document.getElementById('area-canvas');
        if (canvas) {
          setTimeout(() => canvas.focus(), 50);
        }
        updateUIOpenState(); // Update global UI state
      }
    };
  }

  const chatPanelContainer = document.getElementById('chat-panel-container');
  const chatToggle = document.getElementById('chat-toggle');
  const chatClose = document.getElementById('chat-close');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  
  // AI: Initialize chat panel draggable with proper positioning cleanup
  // Removed pre-positioning that caused jump issues - let makeDraggable handle initial positioning
  if (chatPanelContainer) {
    const chatHeader = chatPanelContainer.querySelector('.cursor-grab');
    // AI: Pass onDragStart callback to clean up any CSS positioning classes that could interfere
    makeDraggable(chatPanelContainer, chatHeader, {
      onDragStart: (element) => {
        // AI: Clean up any Tailwind positioning classes that could conflict with pixel-based positioning
        element.style.bottom = 'auto';
        element.style.right = 'auto';
        element.style.transform = 'none';
        element.style.margin = '0';
      }
    });
  }

  // Initialize global chat elements
  chatOnlineIndicator = document.getElementById('chat-online-indicator');
  chatConnectionIndicatorElement = document.getElementById('chat-connection-status');
  onlineCountSidebar = document.getElementById('online-count-sidebar');
  onlineList = document.getElementById('online-list');

  // Set initial connection status to yellow (connecting)
  if (chatConnectionIndicatorElement) {
    chatConnectionIndicatorElement.className = 'w-2 h-2 rounded-full bg-yellow-500 transition-colors';
    chatConnectionIndicatorElement.title = 'Connecting...';
  }
  if (chatOnlineIndicator) {
    chatOnlineIndicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-slate-800 transition-colors';
  }

  // Chat toggle functionality
  let isChatOpen = false;
  // Multiplayer related
  window.currentOnlinePlayers = [];
  window.chatStatusObject = { connected: false, error: null };
  window.isUIOpen = false; // Global flag to indicate if any top-level UI is open
  let onlinePlayersLastReceived = 0;
  const PLAYER_TIMEOUT_MS = 30000; // 30 seconds
  // Store references for Firebase callbacks
  window.globalRenderOnlinePlayers = null;
  window.globalUpdateOnlineStatus = null;
  window.globalRenderMessages = null;

  window.globalUpdateOnlineStatus = function updateOnlineStatus(isConnected) {
    if (chatOnlineIndicator) {
      if (isConnected) {
        chatOnlineIndicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800 transition-colors';
        chatOnlineIndicator.title = 'Connected to chat';
      } else {
        chatOnlineIndicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-slate-800 transition-colors';
        chatOnlineIndicator.title = 'Connecting to chat...';
      }
    }

    // Only update chatConnectionStatus if we don't have player count info
    if (chatConnectionIndicatorElement && (!window.currentOnlinePlayers || window.currentOnlinePlayers.length === 0)) {
      if (isConnected) {
        chatConnectionIndicatorElement.className = 'w-2 h-2 rounded-full bg-green-500 transition-colors';
        chatConnectionIndicatorElement.title = 'Connected to chat';
      } else {
        chatConnectionIndicatorElement.className = 'w-2 h-2 rounded-full bg-yellow-500 transition-colors';
        chatConnectionIndicatorElement.title = 'Connecting to chat...';
      }
    }
  }

  window.globalRenderOnlinePlayers = function renderOnlinePlayers(players) {
    const onlineCount = document.getElementById('online-count');
    const onlineList = document.getElementById('online-list');
    const connectionStatus = document.getElementById('chat-connection-status');

    // AI: Filter out stale players with more lenient timeout to handle idle players better
    // Increased from 45s to 5 minutes to avoid removing idle players who are still connected
    const freshPlayers = players.filter((p) => {
      let updated = 0;
      if (p.updatedAt) {
        if (typeof p.updatedAt === 'number') updated = p.updatedAt;
        else if (typeof p.updatedAt.toMillis === 'function') updated = p.updatedAt.toMillis();
        else if (typeof p.updatedAt === 'string') {
          const n = Number(p.updatedAt);
          if (Number.isFinite(n)) updated = n;
        }
      }
      // If we know they're online but missing timestamp, count them
      if (!updated) return !!p.isOnline;
      return (Date.now() - updated) <= 300000; // 5 minutes freshness window - more tolerant for idle players
    });

    // Store current online players for use in chat rendering
    window.currentOnlinePlayers = freshPlayers.length ? freshPlayers : players;

    const countVal = freshPlayers.length || players.length || 0;
    if (onlineCount) onlineCount.textContent = `${countVal} online`;
    if (connectionStatus) {
      connectionStatus.classList.remove('bg-gray-500', 'bg-green-500', 'bg-yellow-500');
      if (countVal > 0) {
        connectionStatus.classList.add('bg-green-500');
        connectionStatus.title = `${countVal} player${countVal !== 1 ? 's' : ''} online`;
      } else {
        connectionStatus.classList.add('bg-yellow-500');
        connectionStatus.title = 'Connected - No players online';
      }
    }

    if (onlineList) {
      onlineList.innerHTML = '';
      const toRender = freshPlayers.length ? freshPlayers : players;
      toRender.forEach(p => {
        const playerEl = document.createElement('div');
        // Use multiple fallback options for display name
        const displayName = p.username || p.displayName || p.uid || 'Unknown Player';
        playerEl.textContent = displayName;
        playerEl.className = 'text-slate-300 py-0.5 truncate';
        playerEl.title = displayName; // Show full name on hover
        onlineList.appendChild(playerEl);
      });
    }
  }

  function toggleChat() {
    if (!chatPanelContainer) return;

    const isCurrentlyHidden = chatPanelContainer.classList.contains('hidden');

    if (isCurrentlyHidden) {
      chatPanelContainer.classList.remove('hidden');
      if (chatInput) chatInput.disabled = false;
      // Trigger initial online players check if chat panel is opened
      if (window.currentOnlinePlayers && window.currentOnlinePlayers.length > 0) {
        if (window.globalRenderOnlinePlayers) window.globalRenderOnlinePlayers(window.currentOnlinePlayers);
      }

      // AI: Always position the panel in bottom left, ignore saved position
      chatPanelContainer.style.position = 'fixed';
      chatPanelContainer.style.transform = 'none';
      positionChatBottomLeft();

      // AI: Disabled position saving - panel always starts in bottom left
    } else {
      chatPanelContainer.classList.add('hidden');
      if (chatInput) chatInput.disabled = true;

      // AI: No position saving needed - panel always starts in bottom left
    }
    updateUIOpenState(); // Update global UI state
  }

  // AI: Position chat panel in bottom left with margin from edges
  function positionChatBottomLeft() {
    const viewportHeight = window.innerHeight;
    const panelHeight = 400;
    const marginFromEdges = 20; // AI: Margin from screen edges

    chatPanelContainer.style.position = 'fixed';
    chatPanelContainer.style.transform = 'none';
    chatPanelContainer.style.bottom = `${marginFromEdges}px`;
    chatPanelContainer.style.left = `${marginFromEdges}px`;
    // AI: Clear any conflicting positioning properties
    chatPanelContainer.style.top = 'auto';
    chatPanelContainer.style.right = 'auto';
  }

  // AI: Position saving functions removed - chat always starts in bottom left
  
  // Chat toggle button event
  chatToggle?.addEventListener('click', toggleChat);

  // Set initial status to connecting
  if (window.globalUpdateOnlineStatus) window.globalUpdateOnlineStatus(false);
  
  // Close chat button
  chatClose?.addEventListener('click', () => {
    isChatOpen = false;
    chatPanelContainer?.classList.add('hidden');
    // Disable chat input when panel is closed
    if (chatInput) chatInput.disabled = true;
  });
  
  // Initialize chat as closed - disable input if panel is hidden
  if (chatInput && chatPanelContainer && chatPanelContainer.classList.contains('hidden')) {
    chatInput.disabled = true;
  }
  
  // Initial status
  if (window.globalUpdateOnlineStatus) window.globalUpdateOnlineStatus(false);


  // Clicking anywhere on the desktop (that isn't an input) restores gameplay key focus
  if (desktopScreen) {
    desktopScreen.addEventListener('mousedown', (e) => {
      const t = e.target;
      const ae = document.activeElement;
      const isInputLike = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const isInteractive = (el) => !!el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.hasAttribute('onclick') || el.closest('button, a'));

      if (!isInputLike(t) && !isInteractive(t) && isInputLike(ae)) {
        try { ae.blur(); } catch (_) {}
        // After blurring any hidden/stray input, focus game canvas
        const canvas = document.getElementById('area-canvas');
        if (canvas) { try { canvas.focus(); } catch (_) {} }
      }
    }, { capture: true });
  }

  // Ensure chat input starts disabled when panel is hidden on load
  if (chatPanelContainer && chatInput && chatPanelContainer.classList.contains('hidden')) {
    chatInput.disabled = true;
  }

}

  let messagesUnsubscribe = null;
let onlinePlayersUnsubscribe = null;
  let playerDataUnsubscribe = null;
// Global chat elements and functions
  let chatOnlineIndicator, chatConnectionIndicatorElement, onlineCountSidebar, onlineList;
  let onlinePlayers = [];


function updateOnlinePlayersList(players) {
  onlinePlayers = players || [];
  
  // Update online count in sidebar only
  if (onlineCountSidebar) {
    onlineCountSidebar.textContent = `${onlinePlayers.length} online`;
  }
  
  // Update online list
  if (onlineList) {
    onlineList.innerHTML = '';
    onlinePlayers.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer';
      // Use multiple fallback options for display name
      const displayName = player.username || player.displayName || `Player${player.uid?.slice(-4) || 'Unknown'}`;
      playerDiv.innerHTML = `
        <div class="w-3 h-3 rounded-full bg-green-400 flex-shrink-0"></div>
        <span class="truncate font-medium" title="${displayName}">${displayName}</span>
      `;
      onlineList.appendChild(playerDiv);
    });
  }
}

export async function setupUserListeners(user) {
  // Clear all listeners when auth state changes
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  if (onlinePlayersUnsubscribe) {
    onlinePlayersUnsubscribe();
    onlinePlayersUnsubscribe = null;
  }
  if (playerDataUnsubscribe) {
    playerDataUnsubscribe();
    playerDataUnsubscribe = null;
  }

  if (user) {
    gameState.user = user;
    // Generate a proper username if displayName is not available
    if (user.displayName) {
      gameState.username = user.displayName;
      // Update multiplayer manager with the display name
      if (window.multiplayerManager) {
        window.multiplayerManager.updateUsername(user.displayName);
      }
    } else if (user.email) {
      gameState.username = user.email.split('@')[0];
      // Update multiplayer manager with the generated username
      if (window.multiplayerManager) {
        window.multiplayerManager.updateUsername(gameState.username);
      }
    } else {
      gameState.username = `Player${user.uid.slice(-4)}`;
      // Update multiplayer manager with the generated username
      if (window.multiplayerManager) {
        window.multiplayerManager.updateUsername(gameState.username);
      }
    }

    // 1. Ensure player document exists and username is up-to-date
    await ensurePlayerDoc(user.uid, gameState.username);

    // 2. Set up player data listener
    playerDataUnsubscribe = onPlayerDataChange(user.uid, (data) => {
      // AI: The renderPlayerBars function has been removed as the status bars are no longer in the UI.
      if (data.username) {
        gameState.username = data.username;
        // Update multiplayer manager with the database username
        if (window.multiplayerManager) {
          window.multiplayerManager.updateUsername(data.username);
        }
      } else {
        // If no username in database, create one from user data
        gameState.username = user.displayName || user.email?.split('@')[0] || `Player${user.uid.slice(-4)}`;
        // Update multiplayer manager with the generated username
        if (window.multiplayerManager) {
          window.multiplayerManager.updateUsername(gameState.username);
        }
      }
      // AI: Update coin display in the inventory panel.
      // Sync galactic tokens field to local game state and update UI
      if (data.galacticTokens !== undefined) {
        gameState.galacticTokens = data.galacticTokens || 0;
        gameState.playerCoins = gameState.galacticTokens;
        try { updateCoinDisplay(gameState.galacticTokens); } catch (_) {}
      }

      // AI: Update multiplayer manager username when database username is loaded
      if (data.username && window.multiplayerManager) {
        window.multiplayerManager.updateUsername(data.username);
      }

      if (data.galacticTokens !== undefined) {
        gameState.playerCoins = gameState.galacticTokens;
        try { updateCoinDisplay(gameState.galacticTokens); } catch (_) {}
      }

      // AI: Always accept latest snapshot for inventory to avoid getting stuck
      // in a loading state if a local write hangs.
      if (Array.isArray(data.inventory)) {
        // AI: Normalize inventory to 48 slots (expanded from 32 to utilize larger panel) and coerce missing to null
        const normalized = Array.from({ length: 48 }, (_, i) => {
          const slot = data.inventory[i];
          return slot == null ? null : slot;
        });
        gameState.playerInventory = normalized;
        renderInventory();
      } else {
        // Try to recover inventory from localStorage if Firestore data is missing
        tryRecoverInventory(user.uid);
      }
    });

    // 3. Set up chat and presence listeners
    messagesUnsubscribe = onChatMessages((messages) => {
      if (window.globalRenderMessages) window.globalRenderMessages(messages);
    });
    onlinePlayersUnsubscribe = onOnlinePlayersChange((players) => {
      if (window.globalRenderOnlinePlayers) window.globalRenderOnlinePlayers(players);
      updateOnlinePlayersList(players);
      if (window.globalUpdateOnlineStatus) window.globalUpdateOnlineStatus(true); // We're connected if we're getting updates
    });
    
    // 4. Set online status
    updatePlayerOnlineStatus(user.uid, true);
    if (window.globalUpdateOnlineStatus) window.globalUpdateOnlineStatus(true); // Mark as connected

    // 5. Enable chat input and form submit
    // 5. Enable chat input and form submit
    // Listeners are now enabled by enableChat() after gameInstance is ready.
  } else {
    // User is signed out, clear game state
    gameState.user = null;
    gameState.username = null;
  }

  window.addEventListener('beforeunload', () => {
    if (gameState.user) {
      try { playerService.saveNow(); } catch (_) {}
      // Best-effort: mark offline; keep last known area/position for restore
      updatePlayerOnlineStatus(gameState.user.uid, false);
      // Do NOT sign out on refresh/close; keep session persistent

      // AI: Clean up chat bubbles and stop cleanup system before page unload
    }
  });

  // AI: Handle tab visibility with more lenient approach - don't immediately mark offline on alt-tab
  // Use a delayed approach to distinguish between brief alt-tabs and actual navigation away
  let visibilityTimeout = null;
  document.addEventListener('visibilitychange', async () => {
    if (!gameState.user) return;
    if (document.visibilityState === 'hidden') {
      // AI: Don't immediately mark offline - wait 30 seconds to handle brief alt-tabs
      visibilityTimeout = setTimeout(async () => {
        updatePlayerOnlineStatus(gameState.user.uid, false);
        // Force immediate save after delay to survive actual navigation away
        await playerService.saveNow();
      }, 30000); // 30 second delay before marking offline
    } else if (document.visibilityState === 'visible') {
      // AI: Cancel the delayed offline marking since user returned
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = null;
      }
      updatePlayerOnlineStatus(gameState.user.uid, true);
    }
  });

  // Extra safety: pagehide fires reliably on mobile/iOS; best-effort flush on navigation away
  window.addEventListener('pagehide', () => {
    try { playerService.saveNow(); } catch (_) {}
  });

  let lastProcessedMessageId = null;
  let lastProcessedTs = 0;
  let chatStreamInitialized = false;

  window.globalRenderMessages = function renderMessages(messages) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // Debug: Log incoming messages
    console.log('[CHAT] renderMessages called with', messages.length, 'messages');
    if (messages.length > 0) {
      console.log('[CHAT] Latest message:', messages[messages.length - 1]);
    }

    // Find new messages to show as bubbles
    const newMessages = messages.filter(msg => coerceTs(msg.ts) > lastProcessedTs);

    // Update last processed message ID/time
    if (messages.length > 0) {
      const lastTs = coerceTs(messages[messages.length - 1].ts);
      if (lastTs > lastProcessedTs) lastProcessedTs = lastTs;
      lastProcessedMessageId = messages[messages.length - 1].id;
    }

    // Show chat bubbles for new messages from other players
    const remotePlayers = multiplayerManager.getRemotePlayers();

    newMessages.forEach(msg => {

      if (window.gameInstance && msg.uid && msg.uid !== gameState.user?.uid) {
        console.log('[CHAT] Remote players available:', remotePlayers.length);

        const otherPlayer = remotePlayers.find(p => p.uid === msg.uid);
        console.log('[CHAT] Found other player:', otherPlayer ? { uid: otherPlayer.uid, x: otherPlayer.x, y: otherPlayer.y } : null);

        if (otherPlayer && otherPlayer.x !== undefined && otherPlayer.y !== undefined) {
          const screenCoords = worldToScreenCoords(otherPlayer.x, otherPlayer.y, window.gameInstance?.camera || window.camera);
          console.log('[CHAT] Showing chat bubble at:', screenCoords);
          showPlayerMessage(msg.uid, msg.text, screenCoords.x, screenCoords.y - 30, 5000);
        } else {
          console.warn('[CHAT] Could not show bubble - player not found or missing coordinates');
        }
      } else {
        console.log('[CHAT] Skipping message - not from other player or no game instance');
      }
    });

    // If there are new messages from others, show chat temporarily
    const hasIncoming = newMessages.some(m => m.uid && m.uid !== gameState.user?.uid);
    if (hasIncoming) {
      try { showChatTemporarily(); } catch (_) {}
    }
    
    // Render chat messages in the chat panel
    chatMessages.innerHTML = '';
    // Limit displayed messages to last 6
    const toShow = messages.slice(-6);
    toShow.forEach(msg => {
      const msgElement = document.createElement('div');
      msgElement.className = 'chat-message';

      // Player list (left of timestamp)
      const playerListSpan = document.createElement('span');
      playerListSpan.className = 'text-emerald-400 mr-2';
      const onlineUsernames = window.currentOnlinePlayers.map(p => p.username).filter(Boolean);
      const isPlayerOnline = onlineUsernames.includes(msg.username);
      playerListSpan.textContent = isPlayerOnline ? '●' : '○';
      playerListSpan.title = isPlayerOnline ? 'Player is online' : 'Player is offline';

      // Timestamp (left of username/message)
      const tsSpan = document.createElement('span');
      tsSpan.className = 'text-slate-400 mr-2';
      tsSpan.textContent = `[${formatChatTime(msg.ts)}]`;

      const usernameSpan = document.createElement('span');
      usernameSpan.className = 'font-bold text-cyan-400';
      // Ensure username is properly displayed, fallback to 'Unknown' if missing
      const displayName = msg.username || msg.displayName || 'Unknown';
      usernameSpan.textContent = `${displayName}: `;

      const textSpan = document.createElement('span');
      textSpan.textContent = msg.text;

      msgElement.appendChild(playerListSpan);
      msgElement.appendChild(tsSpan);
      msgElement.appendChild(usernameSpan);
      msgElement.appendChild(textSpan);
      chatMessages.appendChild(msgElement);
    });
    // No scrollbars — messages fit the panel (we cap messages to last 6)
  }

  // Format a Firestore Timestamp or Date-like into HH:MM (24h)
  function formatChatTime(ts) {
    try {
      let d;
      if (ts && typeof ts.toDate === 'function') {
        d = ts.toDate();
      } else if (ts instanceof Date) {
        d = ts;
      } else if (typeof ts === 'number' || typeof ts === 'string') {
        d = new Date(ts);
      } else {
        d = new Date();
      }
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch (_) {
      return '--:--';
    }
  }


  // --- Player Stats & Data Sync ---
  // This is now handled in the consolidated onAuthStateChanged listener above.

  // AI: The renderPlayerBars function has been removed as the status bars are no longer part of the UI.
  // This keeps the code clean and removes unnecessary DOM manipulation.

  // --- Initial Render ---
  renderInventory();
}

export function enableChat() {
  const chatInput = document.getElementById('chat-input');
  const chatForm = document.getElementById('chat-form');

  // AI: Consolidated chat message handling to prevent duplicate sends
  // Only use form submit handler - keydown handler was causing duplicates
  if (chatForm && chatInput) {
    // AI: Prevent multiple simultaneous submissions
    let isSubmitting = false;

    chatForm.onsubmit = async (e) => {
      e.preventDefault();

      // AI: Prevent rapid-fire submissions
      if (isSubmitting) return;
      isSubmitting = true;

      const text = chatInput.value.trim();
      if (!text) {
        isSubmitting = false;
        return;
      }

      console.log('Sending chat message:', text);
      const messageText = text; // Store before clearing
      chatInput.value = '';

      try {
        // AI: Send chat message through multiplayerManager (handles both bubbles and global chat)
        if (multiplayerManager.isConnected()) {
          await multiplayerManager.sendChat(messageText);
        } else {
          console.warn('Not connected to multiplayer - cannot send chat');
        }
      } catch (error) {
        console.error('Failed to send chat message:', error);
        // AI: Restore message on failure so user doesn't lose it
        chatInput.value = messageText;
      } finally {
        isSubmitting = false;
      }
    };

    // AI: Optional: Handle Enter key separately for better UX, but prevent duplicate sends
    chatInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // AI: Trigger form submit instead of sending directly
        chatForm.requestSubmit();
      }
    };
  }
}

// Try to recover inventory from localStorage if Firestore data is missing
function tryRecoverInventory(uid) {
  // AI: This function is now a stub.
  // The local storage recovery logic has been removed to ensure inventory is always fetched from Firestore.
  // This prevents issues with stale or outdated local data overwriting the online state.
  // AI: Initialize with expanded 48-slot inventory (increased from 32) to match larger panel and wait for Firestore listener to populate it.
  gameState.playerInventory = Array.from({ length: 48 }, () => null);
  renderInventory();


}

// Function to update the UI based on online players
function updateOnlinePlayersUI(players, isConnected) {
  // Update global chat status object
  window.chatStatusObject.connected = isConnected;
  window.chatStatusObject.error = isConnected ? null : "Disconnected"; // Or a more specific error

  // Only update chat connection indicator if we don't have player count info OR if it's explicitly disconnected
  if (chatConnectionIndicatorElement && (!window.currentOnlinePlayers || window.currentOnlinePlayers.length === 0 || !isConnected)) {
    if (isConnected) {
      chatConnectionIndicatorElement.className = 'w-2 h-2 rounded-full bg-green-500 transition-colors';
      chatConnectionIndicatorElement.title = 'Connected to chat';
    } else {
      chatConnectionIndicatorElement.className = 'w-2 h-2 rounded-full bg-yellow-500 transition-colors';
      chatConnectionIndicatorElement.title = 'Connecting to chat...';
    }
  }

  // Update sidebar online players count
  if (onlineCountSidebar) {
    onlineCountSidebar.textContent = players.length;
  }

  // Update online list
  if (onlineList) {
    onlineList.innerHTML = '';
    players.forEach(p => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer';
      // Use multiple fallback options for display name
      const displayName = p.username || p.displayName || `Player${p.uid?.slice(-4) || 'Unknown'}`;
      playerDiv.innerHTML = `
        <div class="w-3 h-3 rounded-full bg-green-400 flex-shrink-0"></div>
        <span class="truncate font-medium" title="${displayName}">${displayName}</span>
      `;
      onlineList.appendChild(playerDiv);
    });
  }
}

// Helper to check if any top-level UI panel is open
function updateUIOpenState() {
  const mainPanelContainer = document.getElementById('main-panel-container');
  const chatPanelContainer = document.getElementById('chat-panel-container');
  const settingsPanel = document.getElementById('settings-panel');

  window.isUIOpen = (
    !mainPanelContainer?.classList.contains('hidden') ||
    !chatPanelContainer?.classList.contains('hidden') ||
    !settingsPanel?.classList.contains('hidden')
  );
}

// --- Global Panel Control ---
// Global UI elements

// Store references for Firebase callbacks
window.globalRenderOnlinePlayers = null;
window.globalUpdateOnlineStatus = null;
window.globalRenderMessages = null;

// Bridge used by main.js to wire auth → listeners
export function handleAuthChange(user) {
  // Fire and forget; errors inside are handled internally
  setupUserListeners(user);
}
