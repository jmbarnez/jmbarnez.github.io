import { auth } from '/src/utils/firebaseClient.js';
import { onAuthStateChanged } from 'firebase/auth';
import '/src/utils/disclaimer.js';

// Function to handle authentication redirect
function handleAuthRedirect() {
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
}

// Wait for disclaimer to be accepted before handling auth
window.addEventListener('disclaimerAccepted', () => {
  console.log('Disclaimer accepted, proceeding with auth redirect');
  handleAuthRedirect();
});

// Also check if disclaimer was already accepted (in case of page refresh)
document.addEventListener('DOMContentLoaded', () => {
  const disclaimerAccepted = sessionStorage.getItem('wuzaru_disclaimer_accepted');
  if (disclaimerAccepted) {
    console.log('Disclaimer already accepted, proceeding with auth redirect');
    handleAuthRedirect();
  }
});