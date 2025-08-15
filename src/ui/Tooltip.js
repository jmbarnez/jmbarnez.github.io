export const Tooltip = {
  element: null,
  notificationElement: null,
  create() {
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'tooltip';
      document.body.appendChild(this.element);
    }
    return this.element;
  },
  createNotification() {
    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.className = 'tooltip-notification';
      document.body.appendChild(this.notificationElement);
    }
    return this.notificationElement;
  },
  show(e, text) {
    const tooltip = this.create();
    // Reset and ensure not stuck
    tooltip.classList.remove('visible');
    if (text.includes('\n')) {
      tooltip.innerHTML = text.split('\n').map(line => line ? `<div>${line}</div>` : '<div style="height: 8px;"></div>').join('');
    } else {
      tooltip.textContent = text;
    }
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY - 10 + 'px';
    tooltip.classList.add('visible');
  },
  showNotification(x, y, text, duration = 800) {
    const notification = this.createNotification();
    notification.textContent = text;
    notification.style.left = x + 'px';
    notification.style.top = y + 'px';
    notification.classList.remove('visible', 'fade-out');
    
    // Show notification
    requestAnimationFrame(() => {
      notification.classList.add('visible');
    });
    
    // Auto-hide after duration
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.classList.remove('visible', 'fade-out');
        notification.style.left = '-9999px';
        notification.style.top = '-9999px';
      }, 300);
    }, duration);
  },
  hide() { if (this.element) { this.element.classList.remove('visible'); this.element.style.left = '-9999px'; this.element.style.top = '-9999px'; } },
  move(e) { if (this.element && this.element.classList.contains('visible')) { this.element.style.left = e.pageX + 'px'; this.element.style.top = e.pageY + 'px'; } }
};


