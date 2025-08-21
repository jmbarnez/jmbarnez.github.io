/**
 * @file Manages interactive highlighting for game elements that support right-click context menus.
 * This module provides functions to initialize and manage hover-based highlighting, ensuring
 * that only elements intended for interaction (e.g., enemies, world objects with context menus)
 * receive visual feedback when the user's in-game cursor hovers over them.
 *
 * The highlighting is applied by adding/removing a CSS class, which should be defined
 * in the game's stylesheet (e.g., `src/styles/desktop.css`).
 */

// Define the CSS class for active highlighting. This class should be defined in
// `src/styles/desktop.css` to provide the visual highlight effect.
const HIGHLIGHT_CLASS = 'interactive-highlight';

/**
 * Stores the currently highlighted element to prevent redundant operations
 * and ensure only one element is highlighted at a time.
 * @type {HTMLElement | null}
 */
let currentHighlightedElement = null;

/**
 * Determines if an element should be highlighted based on its attributes.
 * An element is highlightable if it has a 'data-right-click-target' attribute.
 * This attribute signifies that the element is interactive and can trigger a context menu.
 *
 * @param {HTMLElement} element - The DOM element to check.
 * @returns {boolean} - True if the element is highlightable, false otherwise.
 */
function isHighlightable(element) {
  // Check if the element has the 'data-right-click-target' attribute.
  // This attribute is used to mark elements that should respond to right-clicks
  // and thus be highlighted on hover.
  return element.hasAttribute('data-right-click-target');
}

/**
 * Applies the highlight to a given element.
 * If an element is already highlighted, its highlight is removed first.
 *
 * @param {HTMLElement} element - The element to apply the highlight to.
 */
function applyHighlight(element) {
  // If there's an element currently highlighted, remove its highlight first.
  // This ensures that only one element is highlighted at any given time.
  if (currentHighlightedElement && currentHighlightedElement !== element) {
    removeHighlight(currentHighlightedElement);
  }

  // Add the highlight class to the new element.
  element.classList.add(HIGHLIGHT_CLASS);
  console.log('InteractiveHighlight: Added class', HIGHLIGHT_CLASS, 'to element:', element);
  console.log('InteractiveHighlight: Element classes now:', element.className);

  // Update the reference to the currently highlighted element.
  currentHighlightedElement = element;
}

/**
 * Removes the highlight from a given element.
 *
 * @param {HTMLElement} element - The element to remove the highlight from.
 */
function removeHighlight(element) {
  // Remove the highlight class from the element.
  element.classList.remove(HIGHLIGHT_CLASS);
  // If the element being unhighlighted is the one currently tracked,
  // clear the tracking variable.
  if (currentHighlightedElement === element) {
    currentHighlightedElement = null;
  }
}

/**
 * Handles the mouseover event to apply highlighting.
 * This function is intended to be attached to a parent container that
 * encompasses all interactive game elements. It uses event delegation
 * to efficiently manage highlighting without attaching individual
 * event listeners to each interactive element.
 *
 * @param {MouseEvent} event - The mouseover event object.
 */
function handleMouseOver(event) {
  // Get the target element of the event.
  const target = event.target;
  console.log('InteractiveHighlight: MouseOver event on', target);

  // Check if the target element is highlightable.
  if (target instanceof HTMLElement && isHighlightable(target)) {
    console.log('InteractiveHighlight: Element is highlightable', target);
    // If it's highlightable and not already highlighted, apply the highlight.
    if (target !== currentHighlightedElement) {
      console.log('InteractiveHighlight: Applying highlight to', target);
      applyHighlight(target);
    }
  } else {
    console.log('InteractiveHighlight: Element is not highlightable', target);
    if (currentHighlightedElement) {
      // If the mouse moves off a highlightable element, remove the highlight.
      console.log('InteractiveHighlight: Removing highlight from', currentHighlightedElement);
      removeHighlight(currentHighlightedElement);
    }
  }
}

/**
 * Handles the mouseout event to remove highlighting.
 * This function complements `handleMouseOver` for proper highlight management.
 *
 * @param {MouseEvent} event - The mouseout event object.
 */
function handleMouseOut(event) {
  // Get the target element of the event.
  const target = event.target;

  // If the mouse leaves the currently highlighted element, remove the highlight.
  if (target instanceof HTMLElement && target === currentHighlightedElement) {
    removeHighlight(target);
  }
}

/**
 * Initializes the interactive highlighting system.
 * This function should be called once when the game UI is loaded.
 * It attaches the necessary event listeners to the specified container.
 *
 * @param {HTMLElement} containerElement - The main DOM element that contains
 *   all interactive game elements (e.g., the game canvas or main game area div).
 */
export function initializeInteractiveHighlight(containerElement) {
  // Ensure a valid container element is provided.
  if (!containerElement || !(containerElement instanceof HTMLElement)) {
    console.error('InteractiveHighlight: Invalid container element provided for initialization.');
    return;
  }

  // Attach mouseover and mouseout listeners to the container element.
  // Using event delegation improves performance by reducing the number of
  // event listeners attached to individual game elements.
  containerElement.addEventListener('mouseover', handleMouseOver);
  containerElement.addEventListener('mouseout', handleMouseOut);

  console.log('InteractiveHighlight: Initialized on container', containerElement);
}

/**
 * Cleans up the interactive highlighting system by removing event listeners.
 * This should be called when the game UI is torn down to prevent memory leaks.
 *
 * @param {HTMLElement} containerElement - The same container element that was
 *   used during initialization.
 */
export function cleanupInteractiveHighlight(containerElement) {
  // Ensure a valid container element is provided.
  if (!containerElement || !(containerElement instanceof HTMLElement)) {
    console.error('InteractiveHighlight: Invalid container element provided for cleanup.');
    return;
  }

  // Remove the event listeners to prevent memory leaks.
  containerElement.removeEventListener('mouseover', handleMouseOver);
  containerElement.removeEventListener('mouseout', handleMouseOut);

  // Clear any active highlight.
  if (currentHighlightedElement) {
    removeHighlight(currentHighlightedElement);
  }

  console.log('InteractiveHighlight: Cleaned up from container', containerElement);
}