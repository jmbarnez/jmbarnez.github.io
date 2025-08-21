import { auth } from '../utils/firebaseClient.js';
import { onAuthStateChanged } from "firebase/auth";
import { initDesktopScreen, handleAuthChange, enableChat } from '../ui/desktop.js';
import { playerService } from '../services/playerService.js';
import { initAreaGame } from '../game/core.js';
import { ensureAreaSeeded, subscribeResourceNodes } from '../game/resources.js';
import { initCharacter } from '../game/character.js';
import { initProjectiles } from '../game/projectiles.js';
import { initEnemies } from '../game/enemies.js';
import { experienceManager } from '../game/experienceManager.js';

class App {
  constructor() {
    this.initTheme();
    this.setupAuthListener();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('gameTheme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
  }

  setupAuthListener() {
    onAuthStateChanged(auth, async user => {
      handleAuthChange(user); // Handle auth changes
      if (user) {
        // User is authenticated, now load save data before showing desktop
        await this.initializeGameForUser(user);
      } else {
        // No user, handled by index.html redirect
      }
    });
  }

  async initializeGameForUser(user) {
    try {
      // Show loading state while save data loads
      this.showLoadingState();
      
      // Initialize player service with user ID
      playerService.initialize(user.uid);
      // Load initial player position from service
      const initialPosition = await playerService.getInitialPosition();
      
      // Initialize the game area after player data is loaded AND DOM is ready
      const areaId = 'beach'; // AI: Hardcoded to 'beach' for now, can be dynamic later.
      await ensureAreaSeeded(areaId);
      subscribeResourceNodes(areaId);
      
      // AI: The DOM is now guaranteed to be ready because the entry point in game.html
      // uses a 'DOMContentLoaded' event listener.
      // The saved position is passed to the game initialization function to ensure it's applied correctly.
      initAreaGame(initialPosition);
      initCharacter(); // AI: Initialize the character after the game area is ready.
      enableChat(); // AI: Enable chat listeners now that the game instance is ready.
      initEnemies();

      // Ensure experience data is loaded and UI is updated
      try {
        await experienceManager.loadFromServer(user.uid);
        console.log('Experience data loaded successfully');
      } catch (error) {
        console.error('Failed to load experience data:', error);
      }
    } catch (error) {
      console.error('Failed to initialize game for user:', error);
      // AI: Removed the setTimeout from the error case as well for consistency.
      // If initialization fails, we should let it fail and log the error,
      // rather than trying to run the game in a potentially broken state.
      initAreaGame();
    }
  }

  showLoadingState() {
    // You can implement a loading indicator here if you wish
  }
}

export function initGame() {
  new App();
}
