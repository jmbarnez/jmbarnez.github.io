/**
 * Public IP Detection Utility
 * Helps detect the external IP address for internet hosting
 */

export class PublicIPDetector {
  constructor() {
    this.publicIP = null;
    this.lastCheck = null;
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get the current public IP address
   * @param {boolean} forceRefresh - Force a new check even if cached
   * @returns {Promise<string|null>} Public IP address or null if failed
   */
  async getPublicIP(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached result if recent and not forcing refresh
    if (!forceRefresh && this.publicIP && this.lastCheck && (now - this.lastCheck) < this.checkInterval) {
      return this.publicIP;
    }

    try {
      // Try multiple services for reliability
      const services = [
        'https://api.ipify.org?format=json',
        'https://ipapi.co/json/',
        'https://httpbin.org/ip'
      ];

      for (const service of services) {
        try {
          const response = await fetch(service, { 
            timeout: 5000,
            mode: 'cors'
          });
          
          if (!response.ok) continue;
          
          const data = await response.json();
          
          // Different services return IP in different formats
          let ip = data.ip || data.query || data.origin;
          
          if (ip && this.isValidIP(ip)) {
            this.publicIP = ip;
            this.lastCheck = now;
            console.log(`[PublicIP] Detected: ${ip} via ${service}`);
            return ip;
          }
        } catch (error) {
          console.warn(`[PublicIP] Service ${service} failed:`, error.message);
          continue;
        }
      }
      
      throw new Error('All IP detection services failed');
      
    } catch (error) {
      console.error('[PublicIP] Failed to detect public IP:', error.message);
      return null;
    }
  }

  /**
   * Validate IP address format
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid IPv4 address
   */
  isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  /**
   * Get connection URLs for both local and external access
   * @param {number} port - The port the game server is running on
   * @returns {Promise<Object>} Object with local and external URLs
   */
  async getConnectionURLs(port = 5173) {
    const localHost = window.location.hostname;
    const publicIP = await this.getPublicIP();
    
    return {
      local: `http://${localHost}:${port}`,
      external: publicIP ? `http://${publicIP}:${port}` : null,
      publicIP: publicIP,
      localIP: localHost
    };
  }

  /**
   * Display connection information to users
   * @param {HTMLElement} container - Element to display info in
   * @param {number} port - Game server port
   */
  async displayConnectionInfo(container, port = 5173) {
    if (!container) return;
    
    const urls = await this.getConnectionURLs(port);
    
    let html = `
      <div class="connection-info">
        <h3>🌐 Connection Information</h3>
        <div class="local-connection">
          <strong>Local Network:</strong> 
          <code>${urls.local}</code>
          <span class="help-text">(for players on your WiFi/LAN)</span>
        </div>
    `;
    
    if (urls.external) {
      html += `
        <div class="external-connection">
          <strong>Internet:</strong> 
          <code>${urls.external}</code>
          <span class="help-text">(for external players - requires port forwarding)</span>
        </div>
        <div class="setup-note">
          ⚠️ External access requires router port forwarding configuration
        </div>
      `;
    } else {
      html += `
        <div class="external-connection error">
          <strong>Internet:</strong> 
          <span>Could not detect public IP</span>
          <div class="help-text">
            Visit <a href="https://whatismyipaddress.com/" target="_blank">whatismyipaddress.com</a> 
            to find your public IP manually
          </div>
        </div>
      `;
    }
    
    html += `
        <div class="help-links">
          <a href="INTERNET_HOSTING_GUIDE.md" target="_blank">📖 Internet Hosting Guide</a> |
          <a href="internet-test.html" target="_blank">🧪 Test Connectivity</a>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * Check if the current connection is likely external
   * @returns {boolean} True if accessing via public IP
   */
  async isExternalConnection() {
    const currentHost = window.location.hostname;
    const publicIP = await this.getPublicIP();
    
    return publicIP && currentHost === publicIP;
  }
}

// Export singleton instance
export const publicIPDetector = new PublicIPDetector();
