/**
 * Utility functions for DOM manipulation and common UI tasks.
 */

/**
 * Waits for a canvas element to be ready and properly rendered in the DOM.
 * This is crucial for ensuring that canvas dimensions are correctly calculated
 * after CSS has been applied and the element is visible.
 * @returns {Promise<HTMLCanvasElement>} A promise that resolves with the canvas element when it's ready.
 * @throws {Error} If the canvas element is not found or not visible after multiple attempts.
 */
export function waitForCanvas() {
  return new Promise((resolve, reject) => {
    const maxAttempts = 200; // Increased attempts to allow more time for rendering.
    let attempts = 0;

    function checkCanvas() {
      const canvas = document.getElementById('area-canvas');
      const areaFrame = document.querySelector('.area-frame');

      // Check if canvas exists, is attached, and has proper dimensions
      if (canvas && document.body.contains(canvas) && canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
        // Check if its parent has dimensions too, sometimes canvas reports size before layout
        if (areaFrame && areaFrame.offsetWidth > 0 && areaFrame.offsetHeight > 0) {
          resolve(canvas);
          return;
        }
      }

      attempts++;
      if (attempts >= maxAttempts) {
        reject(new Error('Canvas element not found or not visible after multiple attempts.'));
        return;
      }
      requestAnimationFrame(checkCanvas);
    }
    requestAnimationFrame(checkCanvas);
  });
}

export function showHighlight(element) {
    if (!element) return;
    element.classList.add('highlight');
  }
  
export function hideHighlight() {
    const highlighted = document.querySelector('.highlight');
    if (highlighted) {
      highlighted.classList.remove('highlight');
    }
  }

/**
 * Ensures that the tooltip overlay element exists in the DOM.
 * If it doesn't exist, it is created and appended to the desktop screen.
 * This overlay is used to display tooltips for inventory items.
 * @returns {HTMLElement|null} The tooltip overlay element, or null if the desktop screen is not available.
 */
export function ensureTooltipOverlay(desktopScreen) {
  if (!desktopScreen) return null;
  let overlay = document.getElementById('inventory-tooltips');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'inventory-tooltips';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '70';
    desktopScreen.appendChild(overlay);
  }
  return overlay;
}

export function hideInventoryTooltip() {
  const overlay = document.getElementById('inventory-tooltips');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.style.display = 'none';
  }
}

/**
 * Displays a tooltip for an inventory item.
 * @param {object} item - The item object to display the tooltip for.
 * @param {number} clientX - The clientX coordinate of the mouse event.
 * @param {number} clientY - The clientY coordinate of the mouse event.
 */
export function showInventoryTooltip(item, clientX, clientY) {
  const overlay = ensureTooltipOverlay(document.getElementById('desktop-screen')); // Ensure desktopScreen is passed or accessible
  if (!overlay) return;

  let tooltip = overlay.querySelector('.inventory-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'inventory-tooltip bg-slate-800/95 text-slate-200 text-xs px-2 py-1 rounded shadow-lg border border-sky-400/20 whitespace-nowrap pointer-events-none z-50';
    tooltip.style.position = 'absolute';
    overlay.appendChild(tooltip);
  }

  // Set content
  let content = `<b>${item.name}</b>`;
  if (item.description) {
    content += `<br/><span class="text-slate-400">${item.description}</span>`;
  }
  if (item.stats && Object.keys(item.stats).length > 0) {
    content += `<br/>Stats: `;
    content += Object.entries(item.stats).map(([key, value]) => `${key}: ${value}`).join(', ');
  }
  tooltip.innerHTML = content;

  // Position tooltip relative to mouse, with offset
  const xOffset = 15;
  const yOffset = 15;
  tooltip.style.left = `${clientX + xOffset}px`;
  tooltip.style.top = `${clientY + yOffset}px`;
  tooltip.style.display = 'block';
}

/**
 * AI: Creates a container for desktop notifications and a function to manage them.
 */
export function ensureNotificationContainer() {
  let container = document.getElementById('desktop-notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'desktop-notifications';
    container.className = 'fixed top-4 right-4 flex flex-col items-end gap-2 z-50';
    document.body.appendChild(container);
  }
  return container;
}

export function showDesktopNotification(message, duration = 3000) {
  const container = ensureNotificationContainer();
  const notification = document.createElement('div');
  notification.className = 'bg-slate-800/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm border border-slate-700';
  notification.textContent = message;
  container.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, duration);
}
