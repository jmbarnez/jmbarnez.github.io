// Test script to verify chat bubbles and interactive highlights are working
console.log('Testing chat bubble and highlight fixes...');

// Test chat bubbles
if (typeof window.testChatBubbles === 'function') {
  console.log('Chat bubble test function found, running test...');
  window.testChatBubbles();
} else {
  console.log('Chat bubble test function not found - ensure character.js is loaded');
}

// Test interactive highlights
function testHighlights() {
  console.log('Testing interactive highlights...');
  
  // Find a ground item or resource node to test highlighting
  const groundItems = document.querySelectorAll('.ground-item');
  const resourceNodes = document.querySelectorAll('.resource-node');
  
  let testElement = null;
  if (groundItems.length > 0) {
    testElement = groundItems[0];
    console.log('Found ground item to test highlighting');
  } else if (resourceNodes.length > 0) {
    testElement = resourceNodes[0];
    console.log('Found resource node to test highlighting');
  }
  
  if (testElement) {
    console.log('Adding highlight class...');
    testElement.classList.add('highlight');
    
    setTimeout(() => {
      console.log('Removing highlight class...');
      testElement.classList.remove('highlight');
    }, 3000);
  } else {
    console.log('No interactive elements found to test highlighting');
  }
}

// Test highlights immediately
testHighlights();

console.log('Test script completed. Check console for results.');
