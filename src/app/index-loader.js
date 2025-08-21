import { auth } from '/src/utils/firebaseClient.js';
import { onAuthStateChanged } from 'firebase/auth';

if (auth) {
  onAuthStateChanged(auth, async user => {
    try {
      const target = user ? './game.html' : './login.html';
      if (!location.pathname.endsWith(target)) {
        location.href = target;
      }
    } catch (e) {
      console.error('Auth redirect failed:', e);
    }
  });
} else {
  console.error('Firebase auth is not initialized.');
}