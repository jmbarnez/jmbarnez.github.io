export class ChatClient {
  constructor({ url, name = null } = {}) {
    // Transport mode: 'ws' (default) or 'http' (Netlify-friendly fallback)
    this.mode = 'ws';

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
    this._completedUrlCycle = false;

    // HTTP fallback state
    this.httpBase = `${window.location.origin}/api/chat`;
    this.httpPlayerId = null;
    this.httpPollTimers = { messages: null, players: null };
    this.httpLastTs = 0;
    this._httpStarted = false;
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
    if (this.mode === 'http') {
      this._startHttpMode();
      return;
    }

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
      this._completedUrlCycle = false;
      
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
    if (this.mode === 'http') {
      this._httpSendMessage(text);
    } else {
      this._send({ type: 'chat', text });
    }
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
      const nextIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
      if (nextIndex === 0) {
        // Completed one full cycle through URLs
        if (!this._completedUrlCycle) {
          this._completedUrlCycle = true;
        } else {
          console.warn('All WebSocket URLs failed after full cycle, switching to HTTP polling mode');
          this.mode = 'http';
          this._startHttpMode();
          return;
        }
      }
      this.currentUrlIndex = nextIndex;
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
      mode: this.mode,
      url: this.mode === 'ws' ? (this.fallbackUrls[this.currentUrlIndex] || this.url) : this.httpBase,
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

  // ---------------------- HTTP fallback implementation ----------------------
  _startHttpMode() {
    if (this._httpStarted) return;
    this._httpStarted = true;
    console.log('Starting HTTP polling chat mode against', this.httpBase);

    // Join chat
    this._httpJoin()
      .then(() => {
        this._emitStatus('online');
        // Start polling loops
        this._startHttpPolling();
        // Ensure leave on unload
        try {
          window.addEventListener('beforeunload', () => {
            try { navigator.sendBeacon?.(`${this.httpBase}/leave`, JSON.stringify({ playerId: this.httpPlayerId })); } catch {}
          });
        } catch {}
      })
      .catch((e) => {
        console.error('HTTP chat join failed', e);
        this._emitStatus('offline');
      });
  }

  async _httpJoin() {
    try {
      const res = await fetch(`${this.httpBase}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.name })
      });
      if (!res.ok) throw new Error(`join failed: ${res.status}`);
      const data = await res.json();
      this.httpPlayerId = data.playerId;
      this.httpLastTs = Date.now();
    } catch (e) {
      throw e;
    }
  }

  _startHttpPolling() {
    // Messages polling
    if (!this.httpPollTimers.messages) {
      this.httpPollTimers.messages = setInterval(async () => {
        try {
          const url = `${this.httpBase}/messages?since=${this.httpLastTs}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            data.messages.forEach((m) => {
              try { this.listeners.forEach((fn) => fn(m)); } catch {}
            });
          }
          if (typeof data.ts === 'number') this.httpLastTs = data.ts;
        } catch (e) {
          // Silent fail to avoid log spam
        }
      }, 2000);
    }

    // Players polling
    if (!this.httpPollTimers.players) {
      this.httpPollTimers.players = setInterval(async () => {
        try {
          const res = await fetch(`${this.httpBase}/players`);
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.players)) {
            const packet = { type: 'players', players: data.players, ts: data.ts || Date.now() };
            try { this.listeners.forEach((fn) => fn(packet)); } catch {}
          }
        } catch (e) {
          // Silent fail
        }
      }, 5000);
    }
  }

  async _httpSendMessage(text) {
    try {
      if (!this.httpPlayerId) return;
      await fetch(`${this.httpBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.httpPlayerId, text })
      });
    } catch (e) {
      // Ignore send errors in polling mode
    }
  }
}


