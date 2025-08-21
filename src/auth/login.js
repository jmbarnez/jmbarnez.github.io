import { auth } from '../utils/firebaseClient.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { playHoverSound, playClickSound } from '../utils/sfx.js';
import { createUserProfile } from '../services/firestoreService.js';
import { makeDraggable } from '../utils/draggable.js';
import { HEALTH_CHECK_URL } from '../utils/constants.js';

export function initLoginScreen() {
  // Reset button states on load to prevent "Please wait..." persistence
  const loginButton = document.getElementById('login-submit');
  const registerButton = document.getElementById('register-submit');
  if (loginButton) {
    loginButton.disabled = false;
    loginButton.textContent = 'Login';
  }
  if (registerButton) {
    registerButton.disabled = false;
    registerButton.textContent = 'Register';
  }

  // No reCAPTCHA or username-to-email lookup; email-only auth

  const allButtons = document.querySelectorAll('button, a');
  allButtons.forEach(button => {
    button.addEventListener('mouseover', playHoverSound);
    button.addEventListener('click', playClickSound);
  });

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showRegisterLink = document.getElementById('show-register');
  const showLoginLink = document.getElementById('show-login');
  const loginMessage = document.getElementById('login-message');

  if (showRegisterLink) {
    showRegisterLink.onclick = (e) => {
      e.preventDefault();
      if (loginForm) loginForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'flex';
      if (loginMessage) loginMessage.textContent = ''; // Clear any messages
    };
  }

  if (showLoginLink) {
    showLoginLink.onclick = (e) => {
      e.preventDefault();
      if (registerForm) registerForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'flex';
      if (loginMessage) loginMessage.textContent = ''; // Clear any messages
    };
  }

  // Initial state: show login form, hide register form
  if (loginForm) loginForm.style.display = 'flex';
  if (registerForm) registerForm.style.display = 'none';

  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const loginButton = document.getElementById('login-submit');
      loginButton.disabled = true;
      loginButton.textContent = 'Logging in...';

      const formData = new FormData(loginForm);
      const email = (formData.get('email') || '').toString().trim();
      const password = formData.get('password');
      try {
        if (!email || !email.includes('@')) {
          throw new Error('Please enter a valid email address.');
        }
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const u = cred.user;
        // Proceed directly to game regardless of profile doc status
        window.location.href = './game.html';
      } catch (error) {
        console.error("Login failed:", error);
        if (loginMessage) loginMessage.textContent = `Login failed: ${error.message || error.code}`;
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
      }
    };
  }

  if (registerForm) {
    registerForm.onsubmit = async (e) => {
      e.preventDefault();
      const registerButton = document.getElementById('register-submit');
      registerButton.disabled = true;
      registerButton.textContent = 'Registering...';

      const formData = new FormData(registerForm);
      const email = formData.get('email');
      const username = formData.get('username');
      const password = formData.get('password');
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Set the user's display name
        await updateProfile(user, { displayName: username });
        
        // Create user profile doc with username
        await createUserProfile(user.uid, email, username);
        
        // Redirect directly to game
        window.location.href = './game.html';

      } catch (error) {
        console.error("Registration failed:", error);
        if (loginMessage) loginMessage.textContent = `Registration failed: ${error.message || error.code}`;
        registerButton.disabled = false;
        registerButton.textContent = 'Register';
      }
    };
  }

  const versionButton = document.getElementById('version-button');
  const versionPanel = document.getElementById('version-panel');
  const versionHeader = document.getElementById('version-header');
  const statusLight = document.getElementById('online-status-light');
  const closeVersionPanelButton = document.getElementById('close-version-panel');

  if (versionButton) {
    versionButton.addEventListener('click', () => {
      versionPanel.classList.toggle('hidden');
    });
  }

  if (closeVersionPanelButton) {
    closeVersionPanelButton.addEventListener('click', () => {
      versionPanel.classList.add('hidden');
    });
  }

  if (versionPanel && versionHeader) {
    makeDraggable(versionPanel, versionHeader, {
      onDragStart: (element) => {
        // AI: Remove Tailwind's centering classes to allow pixel-perfect positioning.
        // The drag utility will set the element to `position: absolute` and handle
        // top/left coordinates, so these transform and positioning classes
        // must be removed to prevent conflicts that cause the "jump".
        element.classList.remove('fixed', 'left-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2');
      }
    });
  }

  // Server status check
  if (statusLight) {
    fetch(HEALTH_CHECK_URL)
      .then(response => response.json())
      .then(data => {
        if (data.ok) {
          statusLight.classList.add('online');
        } else {
          statusLight.classList.add('offline');
        }
      })
      .catch(() => {
        statusLight.classList.add('offline');
      });
  }

  // Initialize recaptcha on load
  // no-op
}
