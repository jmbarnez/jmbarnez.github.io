import { initGame } from '/src/app/main.js';
import { initDesktopScreen } from '../ui/desktop.js';
import { auth } from '/src/utils/firebaseClient.js';
import { onAuthStateChanged } from 'firebase/auth';
import '/src/utils/sfx.js';
import '/src/utils/draggable.js';
import '/src/ui/desktop.js';
import '/src/game/core.js';

// Auth check
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    location.href = './login.html';
  }
});

// Centralized initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize game immediately
  const initializeGame = () => {
    initDesktopScreen();
    initGame();

    // DOM cleanup logic from game.html
    const divs = document.querySelectorAll('body > div');
    divs.forEach(div => {
      if (!div.classList.contains('area-frame') && div.id !== 'desktop-screen') {
        div.remove();
      }
    });
  };

  // Initialize game immediately
  initializeGame();
});