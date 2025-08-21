// Simple right-click controlled robot in the area frame
import { getTime, clamp } from '../utils/math.js';

const state = {
  el: null,
  shadow: null,
  target: null,
  pos: { x: 0, y: 0 },
  speed: 80, // px per second
  raf: 0,
};

// Global state for managing multiple player chat bubbles
const playerBubbles = new Map(); // uid -> bubble element
const bubbleTimeouts = new Map(); // uid -> timeout id

function setPos(x, y) {
  state.pos.x = x; state.pos.y = y;
  if (state.el) {
    state.el.style.left = `${x}px`;
    state.el.style.top = `${y}px`;
  }
  if (state.shadow) {
    state.shadow.style.left = `${x}px`;
    state.shadow.style.top = `${y}px`;
  }
}

function moveLoop(container) {
  // AI: Use getTime utility for safe time measurement
  let last = getTime();
  const step = () => {
    const now = getTime();
    const dt = Math.min(0.016, (now - last) / 1000);
    last = now;
    if (state.target) {
      const dx = state.target.x - state.pos.x;
      const dy = state.target.y - state.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const vx = (dx / dist) * state.speed;
        const vy = (dy / dist) * state.speed;
        let nx = state.pos.x + vx * dt;
        let ny = state.pos.y + vy * dt;
        // Clamp inside container
        const rect = container.getBoundingClientRect();
        nx = clamp(nx, 14, rect.width - 14);
        ny = clamp(ny, 14, rect.height - 14);
        setPos(nx, ny);
      } else {
        state.target = null;
      }
    }
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

export function initCharacter() {
  const frame = document.querySelector('.area-frame');
  if (!frame) return;

  // Create robot elements
  const robot = document.createElement('div');
  robot.className = 'robot';
  const shadow = document.createElement('div'); shadow.className = 'robot-shadow';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble hidden';
  robot.appendChild(bubble);

  frame.appendChild(shadow);
  frame.appendChild(robot);

  state.el = robot;
  state.shadow = shadow;
  state.bubble = bubble;

  // Start in lower-right quadrant but not on panel
  const rect = frame.getBoundingClientRect();
  setPos(rect.width * 0.7, rect.height * 0.7);
  moveLoop(frame);

  // Right-click to set destination
  frame.addEventListener('contextmenu', (e) => {
    // Ignore if event originated from front UI (has higher z-index), but since
    // the UI is on top, those won't bubble here in practice.
    e.preventDefault();
    const r = frame.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    state.target = { x, y };

    // Show/Move a target marker
    let marker = frame.querySelector('.target-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'target-marker';
      frame.appendChild(marker);
    }
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;

    // Auto remove after a bit
    clearTimeout(marker._t);
    marker._t = setTimeout(() => marker.remove(), 1200);
  });
}

// Chat bubble functions
export function showTypingIndicator() {
  if (!state.bubble) return;

  // AI: Clear any existing message content or timeouts before showing typing indicator.
  // This ensures that a message bubble is properly reset before showing typing.
  state.bubble.innerHTML = '';
  clearTimeout(state.messageTimeout);

  // AI: Always set the innerHTML to the typing dots. This ensures the animation
  // is consistently displayed when this function is called, regardless of previous state.
  state.bubble.innerHTML = `
    <div class="typing-dots">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  `;
  state.bubble.dataset.mode = 'typing'; // AI: Set the mode to 'typing'.
  state.bubble.classList.remove('hidden');
}

export function showMessage(text) {
  if (!state.bubble) return;
  // AI: Clear any existing typing indicator or previous message content.
  state.bubble.innerHTML = '';
  clearTimeout(state.messageTimeout); // AI: Clear any pending auto-hide timeouts for the local player bubble.

  state.bubble.innerHTML = text;
  state.bubble.dataset.mode = 'message';
  state.bubble.classList.remove('hidden');
}

export function hideChatBubble() {
  if (!state.bubble) return;

  state.bubble.classList.add('hidden');
  // AI: Ensure innerHTML is cleared when hiding the bubble to remove any lingering content.
  state.bubble.innerHTML = '';
  // AI: Reset the data-mode attribute to ensure proper re-initialization when shown again.
  state.bubble.dataset.mode = '';
}

// Auto-hide message after delay
export function showMessageWithTimeout(text, timeout = 3000) {
  showMessage(text);
  clearTimeout(state.messageTimeout);
  state.messageTimeout = setTimeout(() => {
    hideChatBubble();
  }, timeout);
}

// AI: Enhanced test function for debugging - you can call this from console
window.testChatBubbles = function() {
  console.log('Testing chat bubbles...');

  // AI: Test if game instance exists
  if (!window.gameInstance) {
    console.error('No game instance found. Make sure the game is running.');
    return;
  }

  // AI: Test local player typing
  console.log('Testing local player typing...');
  showTypingIndicator();
  setTimeout(() => {
    console.log('Hiding local typing, showing message...');
    hideChatBubble();
    showMessageWithTimeout('Hello from local player!', 3000);
  }, 2000);

  // AI: Test other player bubble if game instance exists and has other players
  if (window.gameInstance.mp && window.gameInstance.mp.others.size > 0) {
    const firstOtherPlayer = Array.from(window.gameInstance.mp.others.entries())[0];
    const [uid, player] = firstOtherPlayer;

    console.log(`Testing remote player bubble for ${uid}...`);
    setTimeout(() => {
      try {
        // AI: Use proper world-to-screen coordinate conversion
        const screenCoords = window.worldToScreenCoords ?
          window.worldToScreenCoords(player.x, player.y) :
          { x: player.x, y: player.y };

        console.log(`Player coordinates: world(${player.x}, ${player.y}) -> screen(${screenCoords.x}, ${screenCoords.y})`);

        showPlayerTyping(uid, screenCoords.x, screenCoords.y - 30);
      setTimeout(() => {
          hidePlayerBubble(uid);
          showPlayerMessage(uid, 'Hello from other player!', screenCoords.x, screenCoords.y - 30, 3000);
      }, 2000);
      } catch (error) {
        console.error('Error testing remote player bubble:', error);
      }
    }, 4000);
  } else {
    console.log('No other players found, skipping remote player test');
  }
};

// AI: Debug function to check bubble visibility
window.debugChatBubbles = function() {
  console.log('=== Chat Bubble Debug Info ===');
  console.log('Player bubbles count:', playerBubbles.size);

  for (const [uid, bubble] of playerBubbles.entries()) {
    console.log(`Bubble for ${uid}:`, {
      exists: !!bubble,
      connected: bubble.isConnected,
      visible: !bubble.classList.contains('hidden'),
      mode: bubble.dataset.mode,
      position: {
        left: bubble.style.left,
        top: bubble.style.top,
        zIndex: bubble.style.zIndex
      },
      content: bubble.innerHTML.substring(0, 100) + '...'
    });
  }

  // AI: Check if desktop screen exists
  const desktop = document.getElementById('desktop-screen');
  console.log('Desktop screen exists:', !!desktop);

  // AI: Check CSS styles
  const testBubble = document.createElement('div');
  testBubble.className = 'player-chat-bubble message-bubble';
  testBubble.textContent = 'Test';
  testBubble.style.position = 'fixed';
  testBubble.style.left = '100px';
  testBubble.style.top = '100px';
  testBubble.style.zIndex = '60';

  if (desktop) {
    desktop.appendChild(testBubble);
    console.log('Test bubble added. Check if you can see it.');

    setTimeout(() => {
      testBubble.remove();
      console.log('Test bubble removed');
    }, 5000);
  }
};

// Functions for managing other player chat bubbles
/**
 * AI: Creates a new chat bubble element for a player and adds it to the DOM.
 * This function ensures that each player has a single bubble element associated with them.
 * The bubble's styling is handled by the 'player-chat-bubble' and 'message-bubble' CSS classes.
 * @param {string} uid - The unique identifier of the player.
 * @returns {HTMLElement|null} The created bubble element, or null if the desktop container is not found.
 */
export function createPlayerBubble(uid) {
  // AI: If a bubble for this player already exists, return it to avoid duplicates.
  if (playerBubbles.has(uid)) return playerBubbles.get(uid);
  
  // AI: The 'desktop-screen' element is the main container for all in-game UI.
  const desktop = document.getElementById('desktop-screen');
  if (!desktop) return null;
  
  // AI: Create the main bubble element and assign its CSS classes.
  const bubble = document.createElement('div');
  bubble.className = 'player-chat-bubble message-bubble hidden';
  
  // AI: Create the speech bubble tail element.
  const tail = document.createElement('div');
  tail.className = 'bubble-tail';
  bubble.appendChild(tail);
  
  // AI: Add the bubble to the desktop container and store it in the playerBubbles map.
  desktop.appendChild(bubble);
  playerBubbles.set(uid, bubble);

  // AI: Add timestamp tracking for cleanup system
  bubble._createdAt = Date.now();
  bubble._lastUpdate = Date.now();

  return bubble;
}

/**
 * AI: Shows a typing indicator in the player's chat bubble.
 * This function creates the typing dots animation if it's not already present.
 * @param {string} uid - The unique identifier of the player.
 * @param {number} x - The screen x-coordinate to position the bubble.
 * @param {number} y - The screen y-coordinate to position the bubble.
 */
export function showPlayerTyping(uid, x, y) {
  try {
    // AI: Validate input parameters to prevent positioning errors
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      console.warn(`Invalid coordinates for showPlayerTyping: uid=${uid}, x=${x}, y=${y}`);
      return;
    }

    const bubble = createPlayerBubble(uid);
    if (!bubble) {
      console.warn(`Failed to create bubble for player: ${uid}`);
      return;
    }

    // AI: Clear any existing message content or timeouts before showing typing indicator.
    // This ensures that a message bubble is properly reset before showing typing.
    bubble.innerHTML = '';
    clearTimeout(bubble._hideTimeout);

    // AI: Always set the innerHTML to the typing dots. This ensures the animation
    // is consistently displayed when this function is called, regardless of previous state.
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'typing-dots';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dotsContainer.appendChild(dot);
    }
    bubble.appendChild(dotsContainer);

    const tail = document.createElement('div');
    tail.className = 'bubble-tail';
    bubble.appendChild(tail);
    bubble.dataset.mode = 'typing'; // AI: Set the mode to 'typing'.

    // AI: Position the bubble with proper bounds checking to ensure it's visible
    const clampedX = Math.max(0, Math.min(window.innerWidth - 120, x));
    const clampedY = Math.max(0, Math.min(window.innerHeight - 40, y));

    bubble.style.left = `${Math.round(clampedX)}px`;
    bubble.style.top = `${Math.round(clampedY)}px`;
    bubble.classList.remove('hidden');

    // AI: Ensure bubble has proper z-index and is positioned above other elements
    bubble.style.zIndex = '60';
    bubble.style.position = 'fixed';

  } catch (error) {
    console.error(`Error in showPlayerTyping for uid ${uid}:`, error);
  }
}

/**
 * AI: Displays a chat message in the player's bubble.
 * This function sets the text content of the bubble and makes it visible.
 * @param {string} uid - The unique identifier of the player.
 * @param {string} text - The chat message to display.
 * @param {number} x - The screen x-coordinate to position the bubble.
 * @param {number} y - The screen y-coordinate to position the bubble.
 * @param {number} [timeout=4000] - The duration in milliseconds to show the message.
 */
export function showPlayerMessage(uid, text, x, y, timeout = 4000) {
  try {
    // AI: Validate input parameters to prevent errors
    if (!text || typeof text !== 'string' || text.trim() === '') {
      console.warn(`Invalid or empty message for showPlayerMessage: uid=${uid}, text=${text}`);
      return;
    }

    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      console.warn(`Invalid coordinates for showPlayerMessage: uid=${uid}, x=${x}, y=${y}`);
      return;
    }

    const bubble = createPlayerBubble(uid);
    if (!bubble) {
      console.warn(`Failed to create bubble for player: ${uid}`);
      return;
    }

    // AI: Clear any existing content (like typing indicators) and previous timeouts.
    bubble.innerHTML = '';
    clearTimeout(bubble._hideTimeout);

    // AI: Create a text node for the message content with proper sanitization.
    const sanitizedText = text.slice(0, 280); // Limit message length to prevent overflow
    const textNode = document.createTextNode(sanitizedText);
    bubble.appendChild(textNode);

    // AI: Add the speech bubble tail.
    const tail = document.createElement('div');
    tail.className = 'bubble-tail';
    bubble.appendChild(tail);
    bubble.dataset.mode = 'message';

    // AI: Position the bubble with proper bounds checking to ensure it's visible
    const clampedX = Math.max(0, Math.min(window.innerWidth - Math.max(120, sanitizedText.length * 4), x));
    const clampedY = Math.max(0, Math.min(window.innerHeight - 40, y));

    bubble.style.left = `${Math.round(clampedX)}px`;
    bubble.style.top = `${Math.round(clampedY)}px`;
    bubble.classList.remove('hidden');

    // AI: Ensure bubble has proper z-index and is positioned above other elements
    bubble.style.zIndex = '60';
    bubble.style.position = 'fixed';

    // AI: Set a timeout to automatically hide the bubble after a specified duration.
    bubble._hideTimeout = setTimeout(() => {
      hidePlayerBubble(uid);
    }, Math.max(1000, Math.min(timeout, 6000))); // Clamp timeout between 1-6 seconds (shorter max)

  } catch (error) {
    console.error(`Error in showPlayerMessage for uid ${uid}:`, error);
  }
}

export function hidePlayerBubble(uid) {
  try {
    if (!uid || typeof uid !== 'string') {
      console.warn('Invalid uid provided to hidePlayerBubble:', uid);
      return;
    }

    const bubble = playerBubbles.get(uid);
    if (!bubble) {
      // AI: Bubble doesn't exist, nothing to hide
      return;
    }

    // AI: Clear any pending timeouts to prevent race conditions
    clearTimeout(bubble._hideTimeout);
    bubble._hideTimeout = null;

    // AI: Hide the bubble by adding the hidden class
    bubble.classList.add('hidden');

    // AI: Clear innerHTML to remove any lingering content (message or typing dots).
    // This prevents memory leaks and ensures clean state for next use.
    bubble.innerHTML = '';

    // AI: Reset the data-mode attribute to ensure proper re-initialization when shown again.
    bubble.dataset.mode = '';

    // AI: Clear any custom styles that might interfere with future positioning
    bubble.style.left = '';
    bubble.style.top = '';
    bubble.style.zIndex = '';

  } catch (error) {
    console.error(`Error hiding bubble for uid ${uid}:`, error);
  }
}

export function removePlayerBubble(uid) {
  try {
    if (!uid || typeof uid !== 'string') {
      console.warn('Invalid uid provided to removePlayerBubble:', uid);
      return;
    }

    const bubble = playerBubbles.get(uid);
    if (!bubble) {
      // AI: Bubble doesn't exist, nothing to remove
      return;
    }

    // AI: Clear any pending timeouts before removal to prevent memory leaks
    clearTimeout(bubble._hideTimeout);
    bubble._hideTimeout = null;

    // AI: Remove the bubble element from the DOM
    bubble.remove();

    // AI: Remove the bubble from the Map to free memory
    playerBubbles.delete(uid);

    // AI: Log successful removal for debugging purposes
    console.debug(`Successfully removed bubble for player: ${uid}`);

  } catch (error) {
    console.error(`Error removing bubble for uid ${uid}:`, error);
    // AI: Even if there's an error, try to clean up the Map entry
    try {
      playerBubbles.delete(uid);
    } catch (mapError) {
      console.error(`Failed to clean up Map entry for uid ${uid}:`, mapError);
    }
  }
}

// Function to update bubble positions (call this in your game loop)
export function updatePlayerBubblePositions(playersMap, worldToScreenFunc) {
  try {
    // AI: Validate input parameters
    if (!playersMap || typeof playersMap !== 'object') {
      console.warn('Invalid playersMap provided to updatePlayerBubblePositions');
      return;
    }

    if (!worldToScreenFunc || typeof worldToScreenFunc !== 'function') {
      console.warn('Invalid worldToScreenFunc provided to updatePlayerBubblePositions');
      return;
    }

    for (const [uid, player] of playersMap) {
      try {
        const bubble = playerBubbles.get(uid);
        if (!bubble || bubble.classList.contains('hidden')) {
          // AI: Bubble doesn't exist or is hidden, skip positioning
          continue;
        }

        // AI: Validate player coordinates before conversion
        if (typeof player.x !== 'number' || typeof player.y !== 'number' ||
            !isFinite(player.x) || !isFinite(player.y)) {
          console.warn(`Invalid player coordinates for uid ${uid}: x=${player.x}, y=${player.y}`);
          continue;
        }

        // AI: Convert world coordinates to screen coordinates
        const screenCoords = worldToScreenFunc(player.x, player.y);

        // AI: Validate screen coordinates
        if (!screenCoords || typeof screenCoords.x !== 'number' || typeof screenCoords.y !== 'number' ||
            !isFinite(screenCoords.x) || !isFinite(screenCoords.y)) {
          console.warn(`Invalid screen coordinates for uid ${uid}:`, screenCoords);
          continue;
        }

        // AI: Calculate bubble position above player head with proper offset
        const bubbleX = Math.round(screenCoords.x);
        const bubbleY = Math.round(screenCoords.y - 30);

        // AI: Clamp coordinates to prevent bubbles from going off-screen
        const clampedX = Math.max(0, Math.min(window.innerWidth - 120, bubbleX));
        const clampedY = Math.max(0, Math.min(window.innerHeight - 40, bubbleY));

        // AI: Update bubble position with proper z-index
        bubble.style.left = `${clampedX}px`;
        bubble.style.top = `${clampedY}px`;
        bubble.style.zIndex = '60';
        bubble.style.position = 'fixed';

      } catch (playerError) {
        console.error(`Error updating bubble position for uid ${uid}:`, playerError);
        // AI: Continue processing other players even if one fails
        continue;
      }
    }
  } catch (error) {
    console.error('Error in updatePlayerBubblePositions:', error);
  }
}

// Update a specific bubble by uid when you already have screen coordinates
export function updateBubblePosition(uid, screenX, screenY) {
  try {
    // AI: Validate input parameters
    if (!uid || typeof uid !== 'string') {
      console.warn('Invalid uid provided to updateBubblePosition:', uid);
      return;
    }

    if (typeof screenX !== 'number' || typeof screenY !== 'number' ||
        !isFinite(screenX) || !isFinite(screenY)) {
      console.warn(`Invalid screen coordinates for updateBubblePosition: uid=${uid}, x=${screenX}, y=${screenY}`);
      return;
    }

    const bubble = playerBubbles.get(uid);
    if (!bubble || bubble.classList.contains('hidden')) {
      // AI: Bubble doesn't exist or is hidden, nothing to update
      return;
    }

    // AI: Calculate bubble position with proper bounds checking
    const bubbleX = Math.round(screenX);
    const bubbleY = Math.round(screenY);

    // AI: Clamp coordinates to prevent bubbles from going off-screen
    const clampedX = Math.max(0, Math.min(window.innerWidth - 120, bubbleX));
    const clampedY = Math.max(0, Math.min(window.innerHeight - 40, bubbleY));

    // AI: Update bubble position with proper styling
    bubble.style.left = `${clampedX}px`;
    bubble.style.top = `${clampedY}px`;
    bubble.style.zIndex = '60';
    bubble.style.position = 'fixed';

  } catch (error) {
    console.error(`Error updating bubble position for uid ${uid}:`, error);
  }
}



