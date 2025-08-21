/**
 * Disclaimer popup management
 * Shows disclaimer on first visit per session, then hides it
 */

class DisclaimerManager {
  constructor() {
    this.popup = null;
    this.acceptButton = null;
    this.initialized = false;
    this.DISCLAIMER_STORAGE_KEY = 'wuzaru_disclaimer_accepted';
  }

  /**
   * Initialize the disclaimer popup
   */
  init() {
    if (this.initialized) return;

    this.popup = document.getElementById('disclaimer-popup');
    this.acceptButton = document.getElementById('disclaimer-accept');

    if (!this.popup || !this.acceptButton) {
      console.error('Disclaimer popup elements not found');
      return;
    }

    // Set up event listeners
    this.acceptButton.addEventListener('click', () => this.acceptDisclaimer());

    // Check if disclaimer should be shown
    this.checkDisclaimerStatus();

    this.initialized = true;
  }

  /**
   * Check if disclaimer should be shown based on session storage
   */
  checkDisclaimerStatus() {
    const disclaimerAccepted = sessionStorage.getItem(this.DISCLAIMER_STORAGE_KEY);

    if (!disclaimerAccepted) {
      // Show disclaimer if not accepted in this session
      this.showDisclaimer();
    } else {
      // Hide popup if already accepted
      this.hideDisclaimer();
    }
  }

  /**
   * Show the disclaimer popup
   */
  showDisclaimer() {
    if (!this.popup) return;

    // Show popup with animation
    this.popup.style.opacity = '1';
    this.popup.style.pointerEvents = 'auto';

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
  }

  /**
   * Hide the disclaimer popup
   */
  hideDisclaimer() {
    if (!this.popup) return;

    // Hide popup with animation
    this.popup.style.opacity = '0';
    this.popup.style.pointerEvents = 'none';

    // Restore background scrolling
    document.body.style.overflow = '';
  }

  /**
   * Handle disclaimer acceptance
   */
  acceptDisclaimer() {
    // Store acceptance in session storage
    sessionStorage.setItem(this.DISCLAIMER_STORAGE_KEY, 'true');

    // Hide the popup
    this.hideDisclaimer();

    // Dispatch event for other parts of the app to know disclaimer was accepted
    window.dispatchEvent(new CustomEvent('disclaimerAccepted'));
  }

  /**
   * Reset disclaimer (for testing purposes)
   */
  resetDisclaimer() {
    sessionStorage.removeItem(this.DISCLAIMER_STORAGE_KEY);
    this.checkDisclaimerStatus();
  }
}

// Create global instance
window.disclaimerManager = new DisclaimerManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.disclaimerManager.init();
});

export default DisclaimerManager;