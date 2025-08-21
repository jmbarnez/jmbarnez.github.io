import { multiplayerManager } from '../game/multiplayerManager.js';
import { game } from '../game/core.js';

/**
 * AI: Simple ping display in top right corner
 * Shows realtime network latency to the server
 */
class PingDisplay {
  constructor() {
    this.element = null;
    this.updateInterval = null;
  }

  /**
   * AI: Initialize ping display element
   */
  init() {
    // AI: Create ping display element
    this.element = document.createElement('div');
    this.element.id = 'ping-display';
    // Use CSS class for styling so the theme is consistent with other panels
    this.element.className = 'ping-display';

    // AI: Add to document body
    document.body.appendChild(this.element);

    // AI: Start updating ping display
    this.startUpdating();
  }

  /**
   * AI: Start updating ping display every 500ms
   */
  startUpdating() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 500);

    // AI: Initial update
    this.updateDisplay();
  }

  /**
   * AI: Update ping display with current values and movement debug info
   */
  updateDisplay() {
    if (!this.element) return;

    const ping = multiplayerManager.getPing();
    const connected = multiplayerManager.isConnected();
    
    let content = '';
    
    // AI: Movement debug info at the top
    if (game.player && game.player.target) {
      const dx = game.player.target.x - game.player.x;
      const dy = game.player.target.y - game.player.y;
      const dist = Math.hypot(dx, dy);
      const speed = Math.hypot(game.player.vx, game.player.vy);
      
      content += `Target: ${dist.toFixed(1)}px\n`;
      content += `Speed: ${speed.toFixed(1)}px/s\n`;
      content += `Mode: ${game.player.continuousMovement ? 'Hold' : 'Click'}\n`;
      content += '---\n';
    }

    // AI: Ping info at the bottom
    if (!connected) {
      content += 'OFFLINE';
      this.element.style.color = '#ff6b6b';
    } else if (ping === 0) {
      content += 'CONNECTING...';
      this.element.style.color = '#ffd93d';
    } else {
      // AI: Color-code ping based on quality
      let color = '#6bcf7f'; // Green for good ping
      if (ping > 100) color = '#ffd93d'; // Yellow for medium ping
      if (ping > 200) color = '#ff6b6b'; // Red for high ping

      content += `Ping: ${ping}ms`;
      this.element.style.color = color;
    }

    this.element.textContent = content;
  }

  /**
   * AI: Stop updating and cleanup
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * AI: Show/hide ping display
   */
  setVisible(visible) {
    if (this.element) {
      this.element.style.display = visible ? 'block' : 'none';
    }
  }
}

// AI: Export singleton instance
export const pingDisplay = new PingDisplay();