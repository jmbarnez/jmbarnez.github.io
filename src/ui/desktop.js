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

export function initDesktopScreen() {
  // --- DOM Element Lookups ---
  // AI: The status bar and bottom bar have been removed for a cleaner UI.
  const desktopScreen = document.getElementById('desktop-screen');
  const inventoryGrid = document.getElementById('inventory-grid');
  const allButtons = document.querySelectorAll('button');
  // AI: Declare skillsPanel and equipmentPanel here to ensure they are accessible throughout initDesktopScreen.
  const skillsPanel = document.getElementById('skills-panel');
  const equipmentPanel = document.getElementById('equipment-panel');
  const marketPanel = document.getElementById('market-panel'); // AI: Declare marketPanel here to ensure it's accessible throughout initDesktopScreen.

  // --- Module Initialization ---
  initPixelIcons(); // AI: Initialize all pixel icons, including new skill, equipment, and market icons.
  initInventory(inventoryGrid, desktopScreen);
  initDragDrop(desktopScreen);
  initSettingsPanel();
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
  const logoutButton = document.getElementById('btn-logout');
  if (logoutButton) {
    logoutButton.onclick = async () => {
      const u = auth.currentUser;
      if (u) {
        // Save current position before logout if game is loaded
        if (window.gameInstance && window.gameInstance.player) {
          const game = window.gameInstance;
          try {
            playerService.stop(); // Stop saving on logout
            await playerService.saveState(); // Force a final save
          } catch (_) {
            // Silent best-effort failure
          }
        }
        
        // Mark player as offline
        updatePlayerOnlineStatus(u.uid, false);

        // AI: Clean up chat bubbles and stop cleanup system before logout
      }
      signOut(auth).finally(() => {
        window.location.href = '/login.html';
      });
    };
  }

  // Draggable Panels
  const serverStatusPanel = document.getElementById('server-status-panel');
  if (serverStatusPanel) {
    // Dragging disabled for desktop UI panels per current design
    // makeDraggable(serverStatusPanel, serverStatusPanel.querySelector('.panel-header'));
  }
  const chatPanel = document.getElementById('chat-panel-container');
  if (chatPanel) {
    // Chat is fixed and always visible; ensure input is enabled and remove draggable behavior.
    const chatInputEl = document.getElementById('chat-input');
    if (chatInputEl) chatInputEl.disabled = false;
    // If any previous draggable behavior exists, do not attach it for the chat panel.
  }

  // AI: Draggable Skills Panel
  if (skillsPanel) {
    // AI: The skills panel is now part of the tabbed interface, so we don't need to make it draggable.
    // AI: Wire up skill UI elements to experience manager updates
    try {
      const miningBar = document.getElementById('skill-bar-mining');
      const fishingBar = document.getElementById('skill-bar-fishing');
      const gatheringBar = document.getElementById('skill-bar-gathering');
      const miningLevel = document.getElementById('skill-level-mining');
      const fishingLevel = document.getElementById('skill-level-fishing');
      const gatheringLevel = document.getElementById('skill-level-gathering');
      const miningXp = document.getElementById('skill-xp-mining');
      const fishingXp = document.getElementById('skill-xp-fishing');
      const gatheringXp = document.getElementById('skill-xp-gathering');
      const xenohuntingBar = document.getElementById('skill-bar-xenohunting');
      const xenohuntingLevel = document.getElementById('skill-level-xenohunting');
      const xenohuntingXp = document.getElementById('skill-xp-xenohunting');

      if (miningBar || fishingBar || gatheringBar) {
        // Initial render
        const renderSkill = (skillKey, barEl, levelEl, xpEl) => {
          const s = experienceManager.skills[skillKey] || { level: 1, experience: 0 };
          const cur = s.experience;
          const lvl = s.level;
          const reqForThis = getExpForLevel(lvl);
            const reqNext = getExpForLevel(lvl + 1);
            const progress = Math.max(0, Math.min(1, (cur - reqForThis) / Math.max(1, reqNext - reqForThis)));
            if (barEl) barEl.style.width = `${Math.round(progress * 100)}%`;
            if (levelEl) levelEl.textContent = String(lvl);
            if (xpEl) xpEl.textContent = `${Math.round(cur - reqForThis)}/${Math.round(reqNext - reqForThis)}`;
          };

          renderSkill('mining', miningBar, miningLevel, miningXp);
          renderSkill('fishing', fishingBar, fishingLevel, fishingXp);
          renderSkill('gathering', gatheringBar, gatheringLevel, gatheringXp);
          renderSkill('xenohunting', xenohuntingBar, xenohuntingLevel, xenohuntingXp);

          // Subscribe to skill updates
          // AI: Subscribe to experience events to keep the skills panel updated.
          // This ensures that when a player gains experience, the UI reflects the change.
          experienceManager.subscribe((event) => {
            // AI: Check if the event is a skill update.
            // This is the primary event for changes in skill-specific experience.
            if (event.type === 'skillUpdate') {
              const key = event.skill;
              // AI: Use a switch statement for clarity and efficiency.
              // This replaces the previous series of 'if' statements.
              switch (key) {
                case 'mining':
                  renderSkill('mining', miningBar, miningLevel, miningXp);
                  break;
                case 'fishing':
                  renderSkill('fishing', fishingBar, fishingLevel, fishingXp);
                  break;
                case 'gathering':
                  renderSkill('gathering', gatheringBar, gatheringLevel, gatheringXp);
                  break;
                case 'xenohunting':
                  renderSkill('xenohunting', xenohuntingBar, xenohuntingLevel, xenohuntingXp);
                  break;
              }
            } else if (event.type === 'loaded' || event.type === 'reset') {
              // AI: When game data is loaded or reset, update all skills panels.
              // This ensures the UI is synchronized with the game state from the start.
              renderSkill('mining', miningBar, miningLevel, miningXp);
              renderSkill('fishing', fishingBar, fishingLevel, fishingXp);
              renderSkill('gathering', gatheringBar, gatheringLevel, gatheringXp);
              renderSkill('xenohunting', xenohuntingBar, xenohuntingLevel, xenohuntingXp);
            }
          });
      }
    } catch (_) {}
  }

  // AI: Draggable Equipment Panel
  if (equipmentPanel) {
    // AI: The equipment panel is now part of the tabbed interface, so we don't need to make it draggable.
  }

  // AI: Draggable Market Panel
  if (marketPanel) {
    // Dragging disabled for desktop UI panels
    // makeDraggable(marketPanel, document.getElementById('market-header'));
  }

  // Server Status
  const serverStatusText = document.getElementById('server-status-text');
  if (serverStatusText) {
    setTimeout(() => {
      serverStatusText.textContent = 'Online';
      serverStatusText.style.color = '#22c55e'; // green-500
    }, 2000);
  }

  // --- AI: Consolidated Tabbed Panel Logic ---
  const mainPanelContainer = document.getElementById('main-panel-container');
  if (mainPanelContainer) {
    // Re-enable dragging for inventory panel
    makeDraggable(mainPanelContainer, document.getElementById('main-panel-header'));
  }
  const mainPanelToggle = document.getElementById('main-panel-toggle');
  const mainPanelClose = document.getElementById('main-panel-close');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  // Function to toggle the main panel's visibility
  const toggleMainPanel = () => {
    if (mainPanelContainer) {
      mainPanelContainer.classList.toggle('hidden');
    }
  };

  // Event listener for the main toggle button
  if (mainPanelToggle) {
    mainPanelToggle.onclick = toggleMainPanel;
  }

  // Event listener for the close button
  if (mainPanelClose) {
    mainPanelClose.onclick = () => {
      if (mainPanelContainer) {
        mainPanelContainer.classList.add('hidden');
      }
    };
  }

  // Event listener for the 'Tab' key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleMainPanel();
    }
  });

  // Event listeners for tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;

      // Update button styles
      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'text-white');
        btn.classList.add('text-slate-400');
      });
      button.classList.add('active', 'text-white');
      button.classList.remove('text-slate-400');

      // Show/hide content
      tabContents.forEach(content => {
        if (content.id === `${tab}-panel`) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });

  // AI: Market Panel Toggle (market button removed - now accessed via world object)
  const marketClose = document.getElementById('market-close');

  if (marketClose && marketPanel) { // AI: Ensure marketPanel exists before attaching listener.
    marketClose.onclick = () => marketPanel.classList.add('hidden');
  }

  // --- Mute Button ---
  const muteButton = document.getElementById('btn-mute');
  if (muteButton) {
    const iconContainer = muteButton.querySelector('[data-icon]');

    const updateMuteButton = () => {
      const muted = isMuted();
      if (iconContainer) {
        const newIconId = muted ? 'sound-off' : 'sound-on';
        iconContainer.dataset.icon = newIconId;
        iconContainer.innerHTML = ''; // Clear old canvas
        const canvas = createPixelIconForItem({ id: newIconId }, { cssSize: 16, scale: 1 });
        iconContainer.appendChild(canvas);
        iconContainer.className = muted ? 'w-4 h-4 text-red-400' : 'w-4 h-4 text-emerald-400';
      }
      muteButton.title = muted ? 'Sound Off (click to unmute)' : 'Sound On (click to mute)';
      muteButton.setAttribute('aria-pressed', String(muted));
      muteButton.setAttribute('data-muted', String(muted));
      muteButton.className = muted
        ? 'w-7 h-6 flex items-center justify-center rounded bg-red-900/70 hover:bg-red-800 transition ring-1 ring-red-500/50'
        : 'w-7 h-6 flex items-center justify-center rounded bg-slate-800/50 hover:bg-slate-700 transition ring-1 ring-emerald-500/20';
    };

    updateMuteButton();

    muteButton.addEventListener('click', () => {
      setMuted(!isMuted());
      updateMuteButton();
    });
  }


  // --- Chat System ---
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const chatToggle = document.getElementById('chat-toggle');
  const chatPanelContainer = document.getElementById('chat-panel-container');
  const chatClose = document.getElementById('chat-close');
  const chatForm = document.getElementById('chat-form');
  
  // Initialize global chat elements
  chatOnlineIndicator = document.getElementById('chat-online-indicator');
  chatConnectionStatus = document.getElementById('chat-connection-status');
  onlineCountSidebar = document.getElementById('online-count-sidebar');
  onlineList = document.getElementById('online-list');

  // Chat toggle functionality
  let isChatOpen = false;
  
  function toggleChat() {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
      chatPanelContainer?.classList.remove('hidden');
      // Enable chat input when panel is opened
      if (chatInput) chatInput.disabled = false;
    } else {
      chatPanelContainer?.classList.add('hidden');
      // Disable chat input when panel is closed
      if (chatInput) chatInput.disabled = true;
    }
  }
  
  // Chat toggle button event
  chatToggle?.addEventListener('click', toggleChat);
  
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
  updateOnlineStatus(false);


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
let currentOnlinePlayers = [];

// Global chat elements and functions
let chatOnlineIndicator, chatConnectionStatus, onlineCountSidebar, onlineList;
let onlinePlayers = [];

function updateOnlineStatus(isConnected) {
  if (chatOnlineIndicator && chatConnectionStatus) {
    if (isConnected) {
      chatOnlineIndicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-800 transition-colors';
      chatConnectionStatus.className = 'w-2 h-2 rounded-full bg-green-500 transition-colors';
    } else {
      chatOnlineIndicator.className = 'absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800 transition-colors';
      chatConnectionStatus.className = 'w-2 h-2 rounded-full bg-red-500 transition-colors';
    }
  }
}

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

      // Always accept latest snapshot for inventory to avoid getting stuck
      // in a loading state if a local write hangs.
      if (Array.isArray(data.inventory)) {
        // Normalize inventory to 24 slots and coerce missing to null
        const normalized = Array.from({ length: 24 }, (_, i) => {
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
    messagesUnsubscribe = onChatMessages(renderMessages);
    onlinePlayersUnsubscribe = onOnlinePlayersChange((players) => {
      renderOnlinePlayers(players);
      updateOnlinePlayersList(players);
      updateOnlineStatus(true); // We're connected if we're getting updates
    });
    
    // 4. Set online status
    updatePlayerOnlineStatus(user.uid, true);
    updateOnlineStatus(true); // Mark as connected

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

  function renderMessages(messages) {
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
          const screenCoords = worldToScreenCoords(otherPlayer.x, otherPlayer.y);
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
      const onlineUsernames = currentOnlinePlayers.map(p => p.username).filter(Boolean);
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

  function renderOnlinePlayers(players) {
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
    currentOnlinePlayers = freshPlayers.length ? freshPlayers : players;

    const countVal = freshPlayers.length || players.length || 0;
    if (onlineCount) onlineCount.textContent = `${countVal} online`;
    if (connectionStatus) {
      connectionStatus.classList.remove('bg-gray-500', 'bg-green-500', 'bg-yellow-500');
      if (countVal > 0) {
        connectionStatus.classList.add('bg-green-500');
        connectionStatus.title = 'Connected';
      } else {
        connectionStatus.classList.add('bg-gray-500');
        connectionStatus.title = 'No online players';
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
  // We now initialize with an empty inventory and wait for the Firestore listener to populate it.
  gameState.playerInventory = Array.from({ length: 24 }, () => null);
  renderInventory();




}

// Bridge used by main.js to wire auth → listeners
export function handleAuthChange(user) {
  // Fire and forget; errors inside are handled internally
  setupUserListeners(user);
}
