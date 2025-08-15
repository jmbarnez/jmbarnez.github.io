import { CONFIG } from '../config/gameConfig.js';
import { logger } from './logger.js';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = CONFIG.API.BASE_URL;
  }

  private async makeRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = CONFIG.API.TIMEOUTS.REQUEST
    } = options;

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add content type for POST requests
    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${this.baseUrl}${endpoint}`;
    logger.apiCall(endpoint, method);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);
      logger.apiCall(endpoint, method, response.status);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(`API request timeout: ${endpoint}`);
          throw new Error('Request timeout');
        }
        logger.error(`API request failed: ${endpoint}`, error);
        throw error;
      }
      throw new Error('Unknown API error');
    }
  }

  // Convenience methods for common API operations
  async get<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.makeRequest<T>(endpoint, { 
      method: 'POST', 
      body: data,
      timeout: CONFIG.API.TIMEOUTS.SAVE 
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'PUT', body: data });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE' });
  }

  // Game-specific API methods
  async loadSave() {
    try {
      return await this.get(CONFIG.API.ENDPOINTS.SAVE);
    } catch (error) {
      logger.error('Failed to load save data', error);
      return null;
    }
  }

  async saveGame(gameData: any) {
    try {
      return await this.post(CONFIG.API.ENDPOINTS.SAVE, { save: gameData });
    } catch (error) {
      logger.error('Failed to save game data', error);
      return false;
    }
  }

  async authenticate(username: string, password: string, isRegister = false) {
    try {
      const endpoint = CONFIG.API.ENDPOINTS.AUTH + (isRegister ? '/register' : '/login');
      return await this.post(endpoint, { username, password });
    } catch (error) {
      logger.error('Authentication failed', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for testing
export { ApiClient };
