// Multiplayer position sync & RTDB subscriptions
import { game } from './core.js';
import { drawPlayer, drawMiningLaser } from './player.js';
import { updateAreaPlayer } from '../services/realtimePosition.js';
import { playerService } from '../services/playerService.js';
import { getTime } from '../utils/math.js';
// AI: Removed MP constants - using simple multiplayer manager
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../utils/firebaseClient.js';
import { ensurePlayerDoc, updatePlayerOnlineStatus } from '../services/firestoreService.js';
import { joinArea, subscribeAreaPlayers } from '../services/realtimePosition.js';
import { showPlayerTyping, hidePlayerBubble, showPlayerMessage, removePlayerBubble, updatePlayerBubblePositions } from './character.js';
import { worldToScreenCoords } from '../utils/math.js';
import { ensureAreaSeeded, subscribeResourceNodes } from './resources.js';


import { multiplayerManager } from './multiplayerManager.js';

// AI: Simple remote player rendering using multiplayerManager
export function drawRemotePlayers() {
  const { ctx } = game;
  const remotePlayers = multiplayerManager.getRemotePlayers();
  
  // AI: Draw each remote player with simple pixel art
  for (const player of remotePlayers) {
    drawPlayer(player);

    // AI: Draw mining laser if the remote player is mining a node.
    if (player.miningNodeId) {
      const targetNode = game.resourceNodes.find(node => node.id === player.miningNodeId);
      if (targetNode) {
        drawMiningLaser(ctx, player, targetNode);
      }
    }

    // AI: Player name tag
    if (player.username) {
      ctx.fillStyle = '#000000';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, player.x, player.y - 12);
    }
  }
}

// AI: Removed complex broadcast logic - multiplayerManager handles this

// AI: Initialize network functionality.
export function initNetwork() {
  // AI: The subscribeToPlayerData function has been moved to the playerService.
}
