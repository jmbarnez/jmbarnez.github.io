import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Custom plugin to resolve .js imports to .ts files
function typescriptResolver() {
  return {
    name: 'typescript-resolver',
    resolveId(id, importer) {
      if (id.endsWith('.js') && importer) {
        // Convert relative path to absolute
        const absolutePath = path.resolve(path.dirname(importer), id);
        const tsPath = absolutePath.replace(/\.js$/, '.ts');
        
        // Check if .ts file exists
        if (fs.existsSync(tsPath)) {
          return tsPath;
        }
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [typescriptResolver()],
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  server: {
    port: 8000,
    host: '0.0.0.0', // Allow external access
    open: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.app', // Allow all ngrok free app domains
      '.ngrok.app',      // Allow all ngrok app domains
      '.ngrok.io'        // Allow legacy ngrok domains
    ],
    proxy: {
      // Proxy API requests to the auth server
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false
      },
      // Proxy WebSocket connections to the chat server
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true
      }
    }
  },
});


