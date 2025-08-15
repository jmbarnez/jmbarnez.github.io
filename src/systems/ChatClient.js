export class ChatClient {
  constructor({ url, name = null } = {}) {
    // Determine the correct WebSocket URL
    this.url = url || this._getWebSocketUrl();
    this.fallbackUrls = this._getFallbackUrls();
    this.currentUrlIndex = 0;
    this.name = name || localStorage.getItem('playerName') || `Adventurer-${Math.random().toString(36).slice(2, 6)}`;
    this.ws = null;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
  }

  _getWebSocketUrl() {
    const hostname = location.hostname || 'localhost';
    const port = location.port || (location.protocol === 'https:' ? '443' : '80');
    
    console.log('Determining WebSocket URL for hostname:', hostname, 'port:', port);
    
    // If accessing via ngrok domain, use WebSocket through the same domain (Vite will proxy to localhost:3001)
    if (hostname.includes('ngrok-free.app') || hostname.includes('ngrok.app') || hostname.includes('ngrok.io')) {
      // Use wss for secure connections via ngrok, ws path will be proxied by Vite
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${hostname}/ws`;
      console.log('Using ngrok WebSocket URL:', wsUrl);
      return wsUrl;
    }
    
    // Check if we're running through Vite dev server (port 8000)
    if (port === '8000' || (hostname === 'localhost' && port === '8000')) {
      const wsUrl = `ws://${hostname}:${port}/ws`;
      console.log('Using Vite proxy WebSocket URL:', wsUrl);
      return wsUrl;
    }
    
    // Local development - direct connection to chat server
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const chatPort = import.meta.env?.VITE_CHAT_PORT || 3001;
      const wsUrl = `ws://localhost:${chatPort}`;
      console.log('Using direct WebSocket URL:', wsUrl);
      return wsUrl;
    }
    
    // Network access (like 192.168.x.x) - try direct connection first
    const chatPort = import.meta.env?.VITE_CHAT_PORT || 3001;
    const wsUrl = `ws://${hostname}:${chatPort}`;
    console.log('Using network WebSocket URL:', wsUrl);
    return wsUrl;
  }

  _getFallbackUrls() {
    const hostname = location.hostname || 'localhost';
    const port = location.port || (location.protocol === 'https:' ? '443' : '80');
    const fallbacks = [];
    
    // For ngrok domains, only use proxy
    if (hostname.includes('ngrok-free.app') || hostname.includes('ngrok.app') || hostname.includes('ngrok.io')) {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      fallbacks.push(`${protocol}//${hostname}/ws`);
      return fallbacks;
    }
    
    // For localhost/development, try multiple options
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Try Vite proxy first if we're on port 8000
      if (port === '8000') {
        fallbacks.push(`ws://localhost:8000/ws`);
      }
      // Try direct connection to chat server
      fallbacks.push(`ws://localhost:3001`);
      // Try alternative port if environment variable is set
      if (import.meta.env?.VITE_CHAT_PORT && import.meta.env.VITE_CHAT_PORT !== '3001') {
        fallbacks.push(`ws://localhost:${import.meta.env.VITE_CHAT_PORT}`);
      }
    } else {
      // For network access, try direct connection
      fallbacks.push(`ws://${hostname}:3001`);
      if (import.meta.env?.VITE_CHAT_PORT && import.meta.env.VITE_CHAT_PORT !== '3001') {
        fallbacks.push(`ws://${hostname}:${import.meta.env.VITE_CHAT_PORT}`);
      }
    }
    
    return fallbacks;
  }

  connect() {
    try { this.ws?.close?.(); } catch {}
    
    // Use current URL from fallback list
    const currentUrl = this.fallbackUrls[this.currentUrlIndex] || this.url;
    console.log(`Connecting to chat server at: ${currentUrl} (attempt ${this._reconnectAttempts + 1})`);
    
    this.ws = new WebSocket(currentUrl);
    
    // Set a connection timeout
    const connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        console.warn('WebSocket connection timeout');
        this.ws.close();
      }
    }, 10000); // 10 second timeout
    
    this.ws.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
      console.log('Chat WebSocket connected successfully');
      this._reconnectAttempts = 0;
      this.currentUrlIndex = 0; // Reset to first URL on successful connection
      
      // Refresh name in case it changed during login
      try { this.name = localStorage.getItem('playerName') || this.name; } catch {}
      console.log('Sending hello message with name:', this.name);
      this._send({ type: 'hello', name: this.name });
      this._emitStatus('online');
      
      // Request player list after a short delay to ensure server has processed our hello
      setTimeout(() => {
        console.log('Requesting player list');
        this._send({ type: 'requestPlayers' });
      }, 200);
    });
    
    this.ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('Chat message received:', msg);
        this.listeners.forEach((fn) => fn(msg));
      } catch (error) {
        console.error('Error parsing chat message:', error);
      }
    });
    
    this.ws.addEventListener('close', (e) => {
      clearTimeout(connectionTimeout);
      console.log('Chat WebSocket closed:', e.code, e.reason);
      this._emitStatus('offline');
      this._handleConnectionFailure();
    });
    
    this.ws.addEventListener('error', (e) => {
      clearTimeout(connectionTimeout);
      console.error('Chat WebSocket error:', e);
      this._emitStatus('offline');
      try { this.ws.close(); } catch {}
    });
  }

  onMessage(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }

  sendChat(text) {
    if (!text || typeof text !== 'string') return;
    console.log('Sending chat message:', text);
    this._send({ type: 'chat', text });
  }

  _send(obj) {
    try { 
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(obj);
        console.log('Sending WebSocket message:', payload);
        this.ws.send(payload);
      } else {
        console.warn('WebSocket not ready, cannot send:', obj);
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }

  _emitStatus(status) {
    try { this.statusListeners.forEach((fn) => fn(status)); } catch {}
  }

  _handleConnectionFailure() {
    this._reconnectAttempts++;
    
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      // Try next fallback URL
      this.currentUrlIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
      this._reconnectAttempts = 0;
      
      if (this.currentUrlIndex === 0) {
        // We've tried all URLs, wait longer before retrying
        console.warn('All WebSocket URLs failed, waiting 10 seconds before retry...');
        this._scheduleReconnect(10000);
        return;
      } else {
        console.log(`Trying fallback URL: ${this.fallbackUrls[this.currentUrlIndex]}`);
      }
    }
    
    this._scheduleReconnect();
  }

  _scheduleReconnect(delay = null) {
    if (this._reconnectTimer) return;
    
    const reconnectDelay = delay || Math.min(1500 * Math.pow(2, this._reconnectAttempts), 30000);
    console.log(`Scheduling reconnect in ${reconnectDelay}ms`);
    
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, reconnectDelay);
  }

  // Debug method to check connection status
  getDebugInfo() {
    return {
      url: this.fallbackUrls[this.currentUrlIndex] || this.url,
      allUrls: this.fallbackUrls,
      currentUrlIndex: this.currentUrlIndex,
      name: this.name,
      wsState: this.ws?.readyState,
      wsStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws?.readyState] || 'NONE',
      reconnectAttempts: this._reconnectAttempts,
      hasReconnectTimer: !!this._reconnectTimer
    };
  }

  // Force reconnect with next URL
  forceReconnect() {
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
    this._reconnectAttempts = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.connect();
  }
}


