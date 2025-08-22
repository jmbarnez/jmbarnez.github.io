import { auth, database as db } from '../utils/firebaseClient.js';
import { ref, remove } from 'firebase/database';
import { updateAreaPlayer, subscribeAreaPlayers, joinArea as joinAreaRT, clearAreaChatIfMatches } from '../services/realtimePosition.js';
import { worldToScreenCoords } from '../utils/math.js';
import { showPlayerMessage, hidePlayerBubble, updatePlayerBubblePositions } from './character.js';
import { sendChatMessage } from '../services/firestoreService.js';
import { getColorFromUID } from '../utils/color.js';
import { camera } from './world.js';
import { POSITION_UPDATE_RATE, STALE_DATA_THRESHOLD, RECENT_ACTIVITY_THRESHOLD, BASE_STALE_THRESHOLD, MAX_STALE_THRESHOLD, LONG_SESSION_THRESHOLD, INTERPOLATION_DURATION, HEARTBEAT_INTERVAL } from '../utils/constants.js';

/**
 * AI: Ultra-Simple Multiplayer Manager
 * Handles all multiplayer functionality with minimal complexity
 * - Direct position updates (no interpolation)
 * - Simple chat system
 * - Basic presence tracking
 * - Single update frequency
 */
class MultiplayerManager {
  constructor() {
    // AI: Core multiplayer state - single source of truth
    this.localPlayer = {
      uid: null,
      username: 'Anonymous',
      x: 0,
      y: 0,
      action: null,
      angle: 0, // AI: Add angle to player state
      areaId: 'beach',
      color: '#ffffff', // Default color
      miningNodeId: null, // AI: ID of the resource node being mined
    };

    // AI: Remote players - Map<uid, player>
    this.remotePlayers = new Map();

    // AI: Realtime tracking - no fixed intervals
    this.lastUpdate = 0;
    // AI: Initialize lastPosition with angle to ensure rotation changes are tracked.
    this.lastPosition = { x: 0, y: 0, action: null, angle: 0, miningNodeId: null };
    
    // AI: Ping measurement
    this.ping = 0;
    this.pingHistory = [];
    this.lastPingTime = 0;

    // AI: Area subscription state
    this.currentArea = null;
    this.areaUnsubscribe = null;

    // AI: Chat state
    this.chatBubbles = new Map(); // uid -> {element, timeout}
    this.sessionStartTime = Date.now(); // AI: Track when multiplayer session started
    this.pendingProjectileEvent = null; // AI: Queue projectile events for sync

    // AI: Message deduplication tracking
    this._lastMessageTime = 0;
    this._lastMessageContent = '';
    // AI: Track recent outgoing message IDs to ignore echoes from RTDB
    this._recentOutgoingIds = new Set();
    // AI: Global message history to prevent any message from being processed multiple times
    this._globalMessageHistory = new Set();

    // AI: Cleanup interval for stale players
    this.cleanupInterval = null;
  }

  /**
   * AI: Initialize multiplayer system
   */
  initialize(uid, username = 'Anonymous') {
    if (!uid) {
      console.warn('Cannot initialize multiplayer without uid');
      return;
    }

    this.localPlayer.uid = uid;
    this.localPlayer.username = username;
    this.localPlayer.color = getColorFromUID(uid);

    // AI: Do NOT start an automatic cleanup interval for idle players.
    // Requirement: players should only be hidden/removed when they explicitly log out
    // or their RTDB presence is removed via onDisconnect. Starting an interval can
    // incorrectly remove tabbed-out/idle players. We keep a manual cleanup helper
    // available (startCleanupInterval) for debugging but it is not invoked here.

    console.log(`Multiplayer initialized for ${username} (${uid})`);
  }

  /**
   * AI: Queue projectile event for next sync to server
   */
  queueProjectileEvent(eventData) {
    this.pendingProjectileEvent = {
      type: 'projectile',
      timestamp: Date.now(),
      data: eventData
    };
    // Trigger immediate sync if not already pending
    this.syncToServer();
  }

  /**
   * AI: Update local player username
   */
  updateUsername(newUsername) {
    if (!newUsername || typeof newUsername !== 'string') {
      console.warn('Invalid username provided to updateUsername');
      return;
    }

    const trimmedUsername = newUsername.trim();
    if (!trimmedUsername) {
      console.warn('Cannot update to empty username');
      return;
    }

    // Update local player username
    this.localPlayer.username = trimmedUsername;
    console.log(`Username updated to: ${trimmedUsername}`);
  }

  /**
   * AI: Update local player position and sync in realtime
   */
  updateLocalPlayer(x, y, action = null, angle = 0, miningNodeId = null) {
    if (!this.localPlayer.uid) return;

    // AI: Update local state
    this.localPlayer.x = x;
    this.localPlayer.y = y;
    this.localPlayer.action = action;
    this.localPlayer.angle = angle; // AI: Update angle
    this.localPlayer.miningNodeId = miningNodeId; // AI: Update mining target

    // AI: Realtime sync - throttle position updates to prevent ping spikes
    const moved = Math.abs(x - this.lastPosition.x) > 1 ||
                  Math.abs(y - this.lastPosition.y) > 1;
    const angleChanged = Math.abs(angle - this.lastPosition.angle) > 0.01;
    const actionChanged = action !== this.lastPosition.action;
    const miningChanged = miningNodeId !== this.lastPosition.miningNodeId;

    const now = Date.now();
    const timeSinceLastSync = now - this.lastUpdate;

    // Compute quantized moveState based on local speed to save bandwidth.
    // moveState: 0=idle,1=slow,2=medium,3=fast
    try {
      const dx = x - (this.lastPosition.x || x);
      const dy = y - (this.lastPosition.y || y);
      const dist = Math.hypot(dx, dy);
      const secs = Math.max(0.001, timeSinceLastSync / 1000);
      const speed = dist / secs; // px/s
      const norm = Math.min(1, speed / Math.max(1, typeof MAX_SPEED !== 'undefined' ? MAX_SPEED : 200));
      const moveState = Math.floor(norm * 3); // 0..3
      this.localPlayer.moveState = moveState;
    } catch (e) {
      this.localPlayer.moveState = this.localPlayer.moveState || 0;
    }

    // AI: Only sync position changes if enough time has passed (throttle to 100ms minimum)
    if (moved || actionChanged || angleChanged || miningChanged) {
      if (timeSinceLastSync >= 100) { // Minimum 100ms between position syncs
        this.lastPosition = { x, y, action, angle, miningNodeId };
        this.syncToServer();
        this.lastUpdate = now;
      }
      // Update local position immediately for smooth client-side movement
      this.lastPosition = { x, y, action, angle, miningNodeId };
    } else if (timeSinceLastSync > HEARTBEAT_INTERVAL) { // Use shared constant for heartbeat timing
      this.sendHeartbeat();
      this.lastUpdate = now;
    }
  }

  /**
   * AI: Sync local player to server with ping measurement
   */
  syncToServer() {
    if (!this.localPlayer.uid) return;

    const { uid, username, x, y, action, angle, areaId, color } = this.localPlayer;
    const sendTime = Date.now();
    
    // AI: Realtime data structure with ping tracking
    const playerData = {
      username,
      areaId,
      ax: Math.round(x),
      ay: Math.round(y),
      action,
      angle, // AI: Send angle to other players
      color, // AI: Send color to other players
      miningNodeId: this.localPlayer.miningNodeId, // AI: Send mining target
      moveState: this.localPlayer.moveState || 0, // Quantized local move state (0..3)
      lastUpdate: sendTime,
      // Add projectile event if one occurred
      projectileEvent: this.pendingProjectileEvent || null
    };

    // Clear pending projectile event after sending
    this.pendingProjectileEvent = null;

    // AI: Send to server and measure ping
    updateAreaPlayer(areaId, uid, playerData)
      .then(() => {
        // AI: Calculate ping from round-trip time
        const pingTime = Date.now() - sendTime;
        this.updatePing(pingTime);
      })
      .catch(error => {
        console.warn('Failed to sync player position:', error);
      });

    // AI: Simple localStorage backup
    try {
      localStorage.setItem(`playerPos_${uid}`, JSON.stringify({
        x: Math.round(x),
        y: Math.round(y),
        timestamp: sendTime
      }));
    } catch (_) {}
  }

  sendHeartbeat() {
    if (!this.localPlayer.uid) return;

    const { uid, areaId } = this.localPlayer;
    const sendTime = Date.now();
    
    const heartbeatData = {
      lastUpdate: sendTime
    };

    updateAreaPlayer(areaId, uid, heartbeatData)
      .then(() => {
        const pingTime = Date.now() - sendTime;
        this.updatePing(pingTime);
      })
      .catch(error => {
        console.warn('Failed to send heartbeat:', error);
      });
  }

  /**
   * AI: Update ping measurement with rolling average
   */
  updatePing(newPing) {
    this.pingHistory.push(newPing);
    
    // AI: Keep only last 10 measurements for rolling average
    if (this.pingHistory.length > 10) {
      this.pingHistory.shift();
    }
    
    // AI: Calculate average ping
    this.ping = Math.round(
      this.pingHistory.reduce((sum, p) => sum + p, 0) / this.pingHistory.length
    );
    
    this.lastPingTime = Date.now();
  }

  /**
   * AI: Join an area and subscribe to other players
   */
  joinArea(areaId = 'beach') {
    if (this.currentArea === areaId && this.areaUnsubscribe) {
      return; // Already in this area
    }

    // AI: Leave previous area
    if (this.areaUnsubscribe) {
      this.areaUnsubscribe();
      this.areaUnsubscribe = null;
    }

    // AI: Clear remote players from previous area
    this.remotePlayers.clear();
    this.clearAllChatBubbles();

    this.currentArea = areaId;
    this.localPlayer.areaId = areaId;

    // AI: Write presence to RTDB (with onDisconnect removal handled by joinAreaRT)
    // and then subscribe to other players. This ensures presence is removed on
    // client disconnect and that other clients don't see stale entries after logout.
    try {
      if (this.localPlayer.uid) {
        const initial = {
          username: this.localPlayer.username,
          areaId: areaId,
          ax: Math.round(this.localPlayer.x || 0),
          ay: Math.round(this.localPlayer.y || 0),
          action: this.localPlayer.action || null,
          angle: this.localPlayer.angle || 0, // AI: Set initial angle
          color: this.localPlayer.color, // AI: Set initial color
          lastUpdate: Date.now(),
          sessionStart: this.sessionStartTime
        };
        // Best-effort join; don't block subscribing if this fails
        joinAreaRT(areaId, this.localPlayer.uid, initial).catch(() => {});
      }
    } catch (_) {}

    // AI: Subscribe to area updates
    this.areaUnsubscribe = subscribeAreaPlayers(areaId, (event) => {
      this.handlePlayerUpdate(event);
    });

    console.log(`Joined area: ${areaId}`);
  }

  /**
   * AI: Handle player updates from server with improved session and message tracking
   */
  handlePlayerUpdate(event) {
    const { type, uid, data } = event;

    // AI: Ignore own updates
    if (uid === this.localPlayer.uid) return;

    if (type === 'added' || type === 'changed') {
      // If the update contains projectileEvent but not position, handle the
      // projectile immediately using the existing remote player's last-known
      // coordinates. This covers the case where clients only write a
      // projectileEvent field in their presence updates.
      if (data && data.projectileEvent && !(typeof data.ax === 'number' && typeof data.ay === 'number')) {
        const existingPlayer = this.remotePlayers.get(uid);
        if (existingPlayer) {
          const projectileData = data.projectileEvent.data;
          console.log(`[MULTIPLAYER] Received projectile-only update for ${uid}; creating projectile at last-known pos`, { x: existingPlayer.x, y: existingPlayer.y, projectileData });
          if (window.createProjectile && typeof window.createProjectile === 'function') {
            try {
              window.createProjectile({
                startX: existingPlayer.x,
                startY: existingPlayer.y,
                targetX: projectileData.targetX,
                targetY: projectileData.targetY,
                isRemote: true,
                playerId: uid
              });
            } catch (err) {
              console.warn('[MULTIPLAYER] Failed to create projectile from projectile-only update:', err);
            }
          }
        } else {
          // No known position for this player yet; skip - the next position update
          // or combined update will include ax/ay and the projectile will be handled then.
          console.debug(`[MULTIPLAYER] Ignoring projectile-only update for unknown player ${uid}`);
        }
        return;
      }

      if (data && typeof data.ax === 'number' && typeof data.ay === 'number') {
        // AI: Improved session validation - be more lenient with data age for stable connections
        const now = Date.now();
        const dataAge = now - (data.lastUpdate || 0);
        const isStaleData = dataAge > STALE_DATA_THRESHOLD; // Use shared constant for consistency
        const isFromBeforeSession = (data.lastUpdate || 0) < this.sessionStartTime;

        // AI: For 'changed' events, be more lenient if player was already tracked
        const existingPlayer = this.remotePlayers.get(uid);
        const isExistingPlayer = !!existingPlayer;

        // AI: Skip stale data, but allow reconnecting players
        if (isStaleData && !isExistingPlayer && isFromBeforeSession) {
          return;
        }

        // AI: Create or update player with enhanced tracking
        const player = existingPlayer || {
          uid,
          username: data.username || 'Player',
          x: data.ax,
          y: data.ay,
          action: data.action || null,
          angle: data.angle || 0, // AI: Use angle from data or default to 0
          color: data.color || getColorFromUID(uid), // AI: Use color from data or generate it
          height: 20, // Player height for depth sorting
          sessionStart: data.sessionStart || data.lastUpdate || now,
          messageHistory: new Set(), // Track message IDs to prevent duplicates
          lastSeen: now,
          lastUpdate: data.lastUpdate || now
        };

        // AI: Update existing player data with smooth interpolation
        // Store target position for interpolation instead of instant teleport
        if (existingPlayer && (data.ax !== undefined && data.ay !== undefined)) {
          // AI: Set up smooth interpolation for remote players
          player.targetX = data.ax;
          player.targetY = data.ay;
          player.interpStartTime = now;
          player.interpStartX = player.x;
          player.interpStartY = player.y;
          
          // AI: Don't instantly teleport - let interpolation handle it
          // player.x and player.y will be updated in updateRemotePlayerPositions()
        } else {
          // AI: First time seeing this player - set position directly
          player.x = data.ax ?? player.x;
          player.y = data.ay ?? player.y;
        }
        
        player.action = data.action ?? player.action;
        player.angle = data.angle ?? player.angle;
        player.color = data.color || player.color;
        player.miningNodeId = data.miningNodeId || null; // AI: Update mining target
        // Apply quantized moveState (if provided) to control remote body spin visually.
        if (typeof data.moveState === 'number') {
          const SPIN_TABLE = [0, 0.35, 0.75, 1.3]; // radians/sec per state
          player.bodySpinRate = SPIN_TABLE[data.moveState] || 0;
          // initialize bodyRotation if missing so rendering is consistent
          player.bodyRotation = player.bodyRotation || 0;
        }
        player.lastSeen = now;
        player.lastUpdate = data.lastUpdate || now;

        // AI: Track session start time for better stale detection
        if (data.sessionStart && !player.sessionStart) {
          player.sessionStart = data.sessionStart;
        }

        this.remotePlayers.set(uid, player);
        this._invalidatePlayerCache(); // Invalidate cache when player list changes
        console.log(`[MULTIPLAYER] ${existingPlayer ? 'Updated' : 'Added'} player ${uid}:`, {
          username: player.username,
          x: player.x,
          y: player.y,
          totalPlayers: this.remotePlayers.size
        });

        // AI: Handle chat with improved deduplication
        if (data.chat && data.lastUpdate) {
          console.log(`[MULTIPLAYER] Processing chat message from ${uid}: "${data.chat}"`);
          // AI: Use stable messageId without changing timestamp to prevent duplicates
          const stableMessageId = `${uid}_${data.chat}`;

          // AI: Global deduplication - check if we've EVER processed this message ID
          if (!this._globalMessageHistory) {
            this._globalMessageHistory = new Set();
          }
          
          if (this._globalMessageHistory.has(stableMessageId)) {
            return; // Skip already processed message globally
          }
          
          // AI: IMMEDIATELY add to global history to prevent reprocessing during this same event
          this._globalMessageHistory.add(stableMessageId);

          // AI: Ignore echoes of messages we just sent from this client
          if (this._recentOutgoingIds && this._recentOutgoingIds.has(stableMessageId)) {
            try { this._recentOutgoingIds.delete(stableMessageId); } catch (_) {}
            return; // skip own echo
          }

          // AI: Check if we've already processed this exact message for this player
          if (player.messageHistory.has(stableMessageId)) {
            return; // Skip duplicate message
          }

          const messageAge = now - data.lastUpdate;
          const isRecentMessage = messageAge < 5000; // Reduced to 5s for stricter filtering
          const isFromCurrentSession = data.lastUpdate > this.sessionStartTime;
          const isVeryRecentMessage = messageAge < 2000; // Extra strict: only 2 seconds for refresh protection

          // AI: ULTRA STRICT: Only show very recent messages from current session
          // This completely prevents old messages from showing up on refresh
          if (isVeryRecentMessage && isFromCurrentSession) {
            // AI: Add to player message history to prevent future duplicates
            player.messageHistory.add(stableMessageId);

            // AI: Limit message history size to prevent memory leaks
            if (player.messageHistory.size > 100) {
              const oldestMessage = player.messageHistory.values().next().value;
              player.messageHistory.delete(oldestMessage);
            }
            
            // AI: Limit global message history size
            if (this._globalMessageHistory.size > 500) {
              const oldestGlobalMessage = this._globalMessageHistory.values().next().value;
              this._globalMessageHistory.delete(oldestGlobalMessage);
            }

            // AI: Use character.js bubble system for display
            console.log(`[MULTIPLAYER] Showing chat bubble for ${uid} at (${player.x}, ${player.y}): "${data.chat}"`);
            this.showPlayerChatUsingCharacterSystem(uid, data.chat, player.x, player.y);

            console.debug(`Processed chat message from ${player.username}: ${data.chat.substring(0, 50)}...`);
          } else {
            console.debug(`Skipping old message from ${player.username}: age=${messageAge}ms, fromCurrentSession=${isFromCurrentSession}`);
          }
        }

        // AI: Handle typing indicators
        if (data.typing !== undefined) {
          if (data.typing) {
            this.showPlayerTyping(uid, data.ax, data.ay);
          } else {
            this.hidePlayerChat(uid);
          }
        }

        // AI: Handle projectile events from other players
        if (data.projectileEvent && data.projectileEvent.type === 'projectile') {
          const projectileData = data.projectileEvent.data;
          console.log(`[MULTIPLAYER] Processing projectile event from ${uid}:`, projectileData);

          // Create projectile for remote player
          if (window.createProjectile && typeof window.createProjectile === 'function') {
            try {
              // Create projectile with remote player's position and target
              window.createProjectile({
                startX: player.x,
                startY: player.y,
                targetX: projectileData.targetX,
                targetY: projectileData.targetY,
                isRemote: true,
                playerId: uid
              });
            } catch (error) {
              console.warn('[MULTIPLAYER] Failed to create remote projectile:', error);
            }
          }
        }
      }
    } else if (type === 'removed') {
      console.log(`Player removed: ${uid}`);
      this.remotePlayers.delete(uid);
      this._invalidatePlayerCache(); // Invalidate cache when player is removed
      this.hidePlayerChat(uid);
    }
  }

  /**
   * AI: Get all remote players (cached for performance)
   */
  getRemotePlayers() {
    // Cache the result to avoid repeated Array.from() calls
    if (!this._cachedRemotePlayers || this._lastPlayerCount !== this.remotePlayers.size) {
      this._cachedRemotePlayers = Array.from(this.remotePlayers.values());
      this._lastPlayerCount = this.remotePlayers.size;
    }
    return this._cachedRemotePlayers;
  }

  /**
   * AI: Invalidate remote players cache when players change
   */
  _invalidatePlayerCache() {
    this._cachedRemotePlayers = null;
    this._lastPlayerCount = -1;
  }

  /**
   * AI: Update remote player positions with smooth interpolation
   * Call this every frame to smoothly move remote players
   */
  updateRemotePlayerPositions(dt = 0) {
    const now = Date.now();
    const interpDuration = INTERPOLATION_DURATION; // Use shared constant for consistent timing
    
    for (const [uid, player] of this.remotePlayers) {
      // AI: Only interpolate if we have a target position
      if (player.targetX !== undefined && player.targetY !== undefined) {
        const elapsed = now - (player.interpStartTime || now);
        let progress = Math.min(elapsed / interpDuration, 1.0);
        
        // AI: Handle tab deactivation rubber banding by detecting large time gaps
        const timeSinceLastUpdate = now - (player.lastSeen || now);
        const isStaleData = timeSinceLastUpdate > 10000; // 10 seconds old
        
        if (progress >= 1.0 || isStaleData) {
          // AI: Interpolation complete or data is stale - snap to final position
          player.x = player.targetX;
          player.y = player.targetY;
          // AI: Clear interpolation data
          delete player.targetX;
          delete player.targetY;
          delete player.interpStartTime;
          delete player.interpStartX;
          delete player.interpStartY;
        } else {
          // AI: Smooth interpolation using easing
          const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
          player.x = player.interpStartX + (player.targetX - player.interpStartX) * easeProgress;
          player.y = player.interpStartY + (player.targetY - player.interpStartY) * easeProgress;
        }
      }

      // Advance remote bodyRotation based on bodySpinRate if available
      if (typeof player.bodySpinRate === 'number') {
        player.bodyRotation = (player.bodyRotation || 0) + player.bodySpinRate * (dt || 0);
      }
    }
  }

  /**
   * AI: Get local player data
   */
  getLocalPlayer() {
    return { ...this.localPlayer };
  }

  /**
   * AI: Show chat using character.js system with 8px font and dark background
   */
  showPlayerChatUsingCharacterSystem(uid, message, worldX, worldY) {
    if (!message || typeof message !== 'string') return;
    if (typeof worldX !== 'number' || typeof worldY !== 'number') return;

    try {
      // AI: Import required functions from separate modules
      // AI: Convert world coordinates to screen coordinates using the camera.
      const screenCoords = worldToScreenCoords(worldX, worldY, camera);

      // AI: Use character.js showPlayerMessage with proper styling (8px font, dark background)
      showPlayerMessage(uid, message, screenCoords.x, screenCoords.y - 30, 4000);
    } catch (error) {
      console.warn('Error showing player chat:', error);
    }
  }

  // AI: Legacy function kept for compatibility - now uses character.js system
  showPlayerChat(uid, message) {
    const player = this.remotePlayers.get(uid);
    if (!player) return;
    
    this.showPlayerChatUsingCharacterSystem(uid, message, player.x, player.y);
  }

  // AI: Removed - using character.js system instead
  // createChatBubble functionality moved to character.js

  /**
   * AI: Update bubble position above player with proper coordinate conversion
   */
  updateBubblePosition(bubbleElement, worldX, worldY) {
    // AI: Use imported world coordinate conversion
    const screenCoords = worldToScreenCoords(worldX, worldY);
    const screenX = screenCoords.x;
    const screenY = screenCoords.y - 25; // Position above player

    // AI: Clamp to screen bounds
    const clampedX = Math.max(10, Math.min(window.innerWidth - 130, screenX));
    const clampedY = Math.max(10, Math.min(window.innerHeight - 30, screenY));

    bubbleElement.style.left = `${clampedX}px`;
    bubbleElement.style.top = `${clampedY}px`;
  }

  /**
   * AI: Hide player chat bubble using character.js system
   */
  hidePlayerChat(uid) {
    try {
      // AI: Use character.js hidePlayerBubble function
      hidePlayerBubble(uid);
    } catch (error) {
      console.warn('Error hiding player chat:', error);
    }
  }

  /**
   * AI: Send chat message from local player with consolidated flow
   * Handles both real-time delivery and global persistence in single operation
   */
  async sendChat(message) {
    if (!this.localPlayer.uid || !this.isConnected()) {
      throw new Error('Not connected to multiplayer system');
    }

    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message');
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage || trimmedMessage.length === 0) {
      throw new Error('Empty message');
    }

    // AI: Limit message length and create message ID for deduplication
    const chatMessage = trimmedMessage.slice(0, 280); // Increased limit for better UX
    const messageId = `${this.localPlayer.uid}_${chatMessage}_${Date.now()}`;

    // AI: Prevent rapid-fire duplicate messages by checking recent message history
    const now = Date.now();
    if (this._lastMessageTime && (now - this._lastMessageTime) < 1000) {
      // AI: If last message was less than 1 second ago, check if it's a duplicate
      if (this._lastMessageContent === chatMessage) {
        console.warn('Ignoring duplicate message sent too quickly');
        return;
      }
    }

    this._lastMessageTime = now;
    this._lastMessageContent = chatMessage;

    // AI: Prepare comprehensive player data for real-time sync
    // AI: Refactor to send only chat-related data, not the full player state.
    const { uid, username, areaId } = this.localPlayer;
    const sessionStartTime = this.sessionStartTime;

    const chatData = {
      username,
      chat: chatMessage,
      sessionStart: sessionStartTime,
      messageId,
      lastUpdate: now
    };

    try {
      // AI: Single consolidated send operation for both real-time and persistence
      const promises = [];

      // AI: Track outgoing message id so inbound echo can be ignored briefly
      try {
        this._recentOutgoingIds.add(messageId);
        setTimeout(() => { try { this._recentOutgoingIds.delete(messageId); } catch (_) {} }, 10000);
      } catch (_) {}

      // AI: Send to real-time system for chat bubbles
      promises.push(
        updateAreaPlayer(areaId, uid, chatData).catch(error => {
          console.error('Failed to send real-time chat message:', error);
          throw error;
        })
      );

      // AI: Save to global chat for persistence
      promises.push(
        this._saveToGlobalChat(chatMessage, username).catch(error => {
          console.warn('Failed to save to global chat (non-critical):', error);
          // AI: Don't throw here - global chat failure shouldn't break real-time chat
        })
      );

      // AI: Wait for critical real-time send to complete
      await promises[0];

      // AI: Optional: Wait for global chat save with timeout
      try {
        await Promise.race([
          promises[1],
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
      } catch (error) {
        console.debug('Global chat save timed out or failed (non-critical)');
      }

      console.log(`Chat message sent successfully: "${chatMessage.substring(0, 50)}..."`);

      // AI: Schedule cleanup of ephemeral chat field to avoid repeated RTDB triggers
      // Keep the messageId present for a short window so other clients can dedupe and display.
      try {
        const cleanupDelayMs = 100; // wait 100ms before clearing ephemeral chat (much faster)
        const cleanupId = messageId; // capture
        setTimeout(() => {
          // Best-effort: only clear if messageId still matches using a transaction helper
          // AI: Use the statically imported clearAreaChatIfMatches function.
          try {
            clearAreaChatIfMatches(areaId, uid, cleanupId).catch(() => {});
          } catch (_) {}
        }, cleanupDelayMs);
      } catch (_) {}

    } catch (error) {
      console.error('Failed to send chat message:', error);
      throw error; // AI: Re-throw to allow UI to handle failure
    }
  }

  /**
   * AI: Helper method to save message to global chat
   */
  async _saveToGlobalChat(message, username) {
    try {
      // AI: Use the statically imported auth object.

      const user = auth.currentUser;
      if (!user) {
        throw new Error('No authenticated user');
      }

      await sendChatMessage(message, user, username);
    } catch (error) {
      // AI: Re-throw with more context
      throw new Error(`Global chat save failed: ${error.message}`);
    }
  }

  /**
   * AI: Update all chat bubble positions using character.js system
   */
  updateChatPositions() {
    try {
      // AI: Use character.js updatePlayerBubblePositions function and pass the camera for coordinate conversion.
      updatePlayerBubblePositions(this.remotePlayers, (worldX, worldY) => worldToScreenCoords(worldX, worldY, camera));
    } catch (error) {
      console.warn('Error updating chat positions:', error);
    }
  }

  /**
   * AI: Clear all chat bubbles using character.js system
   */
  clearAllChatBubbles() {
    try {
      // AI: Use character.js cleanupAllBubbles function
      // AI: The cleanupAllBubbles function has been removed.
      // The chat bubbles are now automatically managed by timeouts.
    } catch (error) {
      console.warn('Error clearing chat bubbles:', error);
    }
    
    // AI: Clear our own tracking maps
    this.chatBubbles.clear();
  }

  /**
   * AI: Remove player from server when they disconnect
   */
  async removePlayerFromServer() {
    if (!this.localPlayer.uid || !this.currentArea) return;

    try {
      // AI: Use the statically imported Firebase database functions
      
      // AI: Remove player from area players list
      const playerRef = ref(db, `areas/${this.currentArea}/players/${this.localPlayer.uid}`);
      await remove(playerRef);
      
      console.log(`Removed player ${this.localPlayer.uid} from server`);
    } catch (error) {
      console.warn('Failed to remove player from server:', error);
    }
  }

  /**
   * AI: Enhanced disconnect method with comprehensive cleanup
   */
  async disconnect() {
    console.log('Starting comprehensive multiplayer disconnect...');

    // AI: Stop cleanup interval first
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // AI: Unsubscribe from area updates
    if (this.areaUnsubscribe) {
      this.areaUnsubscribe();
      this.areaUnsubscribe = null;
    }

    // AI: Clear all chat bubbles and message history
    this.clearAllChatBubbles();

    // AI: Clear message deduplication tracking
    this._lastMessageTime = 0;
    this._lastMessageContent = '';

    // AI: Clear remote players and clean up their resources
    for (const [uid, player] of this.remotePlayers.entries()) {
      if (player.messageHistory) {
        player.messageHistory.clear();
      }
    }
    this.remotePlayers.clear();

    // AI: Remove player from server
    try {
      if (this.localPlayer.uid && this.currentArea) {
        await this.removePlayerFromServer();
      }
    } catch (error) {
      console.warn('Error removing player from server during disconnect:', error);
    }

    // AI: Reset local player state
    this.localPlayer = {
      uid: null,
      username: 'Anonymous',
      x: 0,
      y: 0,
      action: null,
      angle: 0,
      areaId: 'beach',
      color: '#ffffff'
    };

    // AI: Reset area state
    this.currentArea = null;

    // AI: Reset session tracking
    this.sessionStartTime = Date.now();

    console.log('Multiplayer disconnect completed successfully');
  }

  /**
   * AI: Get connection status
   */
  isConnected() {
    return !!this.localPlayer.uid && !!this.currentArea;
  }

  /**
   * AI: Get current ping value
   */
  getPing() {
    return this.ping;
  }

  /**
   * AI: Start cleanup interval for removing stale players
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupStalePlayers();
    }, 15000); // Clean up every 15 seconds
  }

  /**
   * AI: Clean up players who haven't been seen recently
   * Improved logic to handle idle/tabbed out players properly
   */
  cleanupStalePlayers() {
    const now = Date.now();
    // AI: More sophisticated stale detection based on player activity patterns
    const baseStaleThreshold = BASE_STALE_THRESHOLD; // Use shared constant
    const maxStaleThreshold = MAX_STALE_THRESHOLD; // Use shared constant

    for (const [uid, player] of this.remotePlayers) {
      const timeSinceLastUpdate = now - (player.lastUpdate || player.lastSeen);
      const timeSinceLastSeen = now - (player.lastSeen || 0);

      // AI: Skip cleanup for players with very recent activity
      if (timeSinceLastUpdate < RECENT_ACTIVITY_THRESHOLD) { // Use shared constant
        continue;
      }

      // AI: For players with no recent updates but recent presence, be more lenient
      // This handles tabbed-out/idle players who are still connected
      let isStale = false;
      let reason = '';

      if (timeSinceLastUpdate > maxStaleThreshold) {
        // AI: Player hasn't sent any updates for 10 minutes - definitely stale
        isStale = true;
        reason = 'no updates for 10+ minutes';
      } else if (timeSinceLastSeen > maxStaleThreshold) {
        // AI: Player hasn't been seen for 10 minutes - definitely stale
        isStale = true;
        reason = 'not seen for 10+ minutes';
      } else if (timeSinceLastUpdate > baseStaleThreshold) {
        // AI: Check if this might be a tabbed-out player by looking at activity pattern
        const hasRecentActivity = (player.lastUpdate || 0) > (now - baseStaleThreshold);
        const isLikelyIdle = !hasRecentActivity && timeSinceLastUpdate > baseStaleThreshold;

        if (isLikelyIdle) {
          // AI: Additional check - if player has been consistently active before going idle,
          // give them more time before marking as stale
          const sessionDuration = now - (player.sessionStart || now);
          const isLongSessionPlayer = sessionDuration > LONG_SESSION_THRESHOLD; // Use shared constant

          if (isLongSessionPlayer && timeSinceLastUpdate < maxStaleThreshold) {
            // AI: Long session player who went idle - give them more time
            console.debug(`Keeping idle long-session player: ${player.username} (${uid}) - idle for ${Math.round(timeSinceLastUpdate / 1000)}s`);
            continue;
          } else {
            isStale = true;
            reason = 'idle timeout exceeded';
          }
        }
      }

      if (isStale) {
        console.log(`Removing stale player: ${player.username} (${uid}) - ${reason} (${Math.round(timeSinceLastUpdate / 1000)}s since update)`);
        this.remotePlayers.delete(uid);
        this.hidePlayerChat(uid);
      }
    }
  }
  /**
   * AI: A new update function to be called on every game loop tick.
   * This will allow for smooth interpolation of remote player positions.
   * @param {number} dt - Delta time since the last frame.
   */
  /**
   * AI: Get simple stats
   */

  getStats() {
    return {
      connected: this.isConnected(),
      localPlayer: this.localPlayer.uid,
      remotePlayers: this.remotePlayers.size,
      currentArea: this.currentArea,
      chatBubbles: this.chatBubbles.size,
      ping: this.ping
    };
  }
}

// AI: Export singleton instance
export const multiplayerManager = new MultiplayerManager();