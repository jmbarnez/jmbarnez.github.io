/**
 * Loading Screen Management System
 * Handles loading states during game initialization, login, and tab transitions
 * to prevent visual glitches and rubber banding
 */

class LoadingScreen {
  constructor() {
    this.screen = null;
    this.messageElement = null;
    this.isVisible = true;
    this.init();
  }

  init() {
    this.screen = document.getElementById('loading-screen');
    this.messageElement = document.getElementById('loading-message');

    if (!this.screen) {
      console.warn('Loading screen element not found');
      return;
    }

    // Initially show loading screen
    this.show('Initializing game...');

    // Setup tab focus/blur handlers
    this.setupTabHandlers();

    // Setup page visibility handlers
    this.setupVisibilityHandlers();
  }

  show(message = 'Loading...') {
    if (!this.screen) return;

    this.isVisible = true;
    this.screen.classList.remove('hidden');
    this.updateMessage(message);

    // Debug: console.log(`Loading screen shown: ${message}`);
  }

  hide() {
    if (!this.screen) return;

    this.isVisible = false;
    this.screen.classList.add('hidden');

    // Debug: console.log('Loading screen hidden');
  }

  updateMessage(message) {
    if (this.messageElement) {
      this.messageElement.textContent = message;
    }
  }

  setupTabHandlers() {
    // Handle window focus/blur for loading screen
    window.addEventListener('blur', () => {
      // Debug: console.log('Window blur - showing loading screen');
      this.show('Resuming game...');
    });

    window.addEventListener('focus', () => {
      // Debug: console.log('Window focus - game should be ready');
      // Request game to snap any transient state (angles, interpolations)
      try { document.dispatchEvent(new Event('game:request-snap')); } catch (_) {}

      // Wait for the game to be ready (canvas/context/loop running) or timeout before hiding
      this.waitForGameReady({ timeout: 2000, checkInterval: 50 }).then(() => {
        setTimeout(() => this.hide(), 200); // small buffer after ready
      }).catch(() => {
        // On timeout still hide after a conservative delay
        setTimeout(() => this.hide(), 300);
      });
    });
  }

  setupVisibilityHandlers() {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Debug: console.log('Page hidden - showing loading screen');
        this.show('Game paused...');
      } else {
        // Debug: console.log('Page visible - resuming game');
        // Request a snap (ensure enemies, players align) then wait for readiness
        try { document.dispatchEvent(new Event('game:request-snap')); } catch (_) {}

        this.waitForGameReady({ timeout: 2500, checkInterval: 50 }).then(() => {
          setTimeout(() => this.hide(), 300);
        }).catch(() => {
          setTimeout(() => this.hide(), 500);
        });
      }
    });
  }

  // Wait for the client game to be responsive again. Resolves when game appears ready or rejects on timeout.
  waitForGameReady({ timeout = 2000, checkInterval = 50 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const game = window.gameInstance;
        // Consider ready if canvas/context exist and main loop has started (lastTs > 0)
        if (game && game.ctx && game.lastTs && game.lastTs > 0) {
          resolve();
          return;
        }
        if (Date.now() - start > timeout) {
          reject(new Error('waitForGameReady timeout'));
          return;
        }
        setTimeout(check, checkInterval);
      };
      check();
    });
  }

  // Utility methods for specific loading states
  showLoginLoading() {
    this.show('Authenticating...');
  }

  showGameLoading() {
    this.show('Loading game world...');
  }

  showAreaLoading(areaName) {
    this.show(`Loading ${areaName}...`);
  }

  showNetworkIssue() {
    this.show('Reconnecting...');
  }

  // Method to check if loading screen is currently visible
  getIsVisible() {
    return this.isVisible;
  }
}

// Create singleton instance
const loadingScreen = new LoadingScreen();

export default loadingScreen;
export { LoadingScreen };
