class NotificationManager {
  constructor() {
    this.container = null;
    this.notifications = new Map();
    this.nextId = 1;
    this.init();
  }

  init() {
    this.container = document.getElementById('notificationContainer');
    if (!this.container) {
      console.warn('Notification container not found');
    }
  }

  show(options) {
    if (!this.container) return null;

    const {
      title = '',
      message = '',
      type = 'info', // success, error, warning, info
      duration = 5000,
      onClick = null,
      persistent = false
    } = options;

    const id = this.nextId++;
    const notification = this.createNotificationElement({
      id,
      title,
      message,
      type,
      onClick,
      persistent
    });

    this.container.appendChild(notification);
    this.notifications.set(id, notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto-remove after duration (unless persistent)
    if (!persistent && duration > 0) {
      setTimeout(() => {
        this.hide(id);
      }, duration);
    }

    return id;
  }

  createNotificationElement({ id, title, message, type, onClick, persistent }) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.dataset.id = id;

    const iconSvg = this.getIconForType(type);
    
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon ${type}">
          ${iconSvg}
        </div>
        <div class="notification-text">
          ${title ? `<div class="notification-title">${title}</div>` : ''}
          ${message ? `<div class="notification-description">${message}</div>` : ''}
        </div>
      </div>
    `;

    // Handle click events
    notification.addEventListener('click', () => {
      if (onClick) {
        onClick();
      }
      if (!persistent) {
        this.hide(id);
      }
    });

    return notification;
  }

  getIconForType(type) {
    const icons = {
      success: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
      info: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`
    };
    return icons[type] || icons.info;
  }

  hide(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    notification.classList.remove('show');
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      this.notifications.delete(id);
    }, 300); // Match CSS transition duration
  }

  clear() {
    for (const id of this.notifications.keys()) {
      this.hide(id);
    }
  }

  // Convenience methods
  success(title, message, options = {}) {
    return this.show({ ...options, title, message, type: 'success' });
  }

  error(title, message, options = {}) {
    return this.show({ ...options, title, message, type: 'error' });
  }

  warning(title, message, options = {}) {
    return this.show({ ...options, title, message, type: 'warning' });
  }

  info(title, message, options = {}) {
    return this.show({ ...options, title, message, type: 'info' });
  }
}

// Create and export singleton instance
const notificationManagerInstance = new NotificationManager();
export { notificationManagerInstance as NotificationManager };