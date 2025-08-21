import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';

// Custom plugin to move HTML files to root after build
const moveHtmlPlugin = () => {
  return {
    name: 'move-html',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const srcDir = resolve(distDir, 'src/components');
      
      // Move HTML files from src/components to root
      const htmlFiles = ['index.html', 'login.html', 'game.html', '404.html'];
      htmlFiles.forEach(file => {
        const src = resolve(srcDir, file);
        const dest = resolve(distDir, file);
        if (existsSync(src)) {
          copyFileSync(src, dest);
        }
      });
    }
  };
};

export default defineConfig({
  publicDir: resolve(__dirname, 'public'),
  define: {
    global: {},
  },
  plugins: [moveHtmlPlugin()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/components/index.html'),
        login: resolve(__dirname, 'src/components/login.html'),
        game: resolve(__dirname, 'src/components/game.html'),
        '404': resolve(__dirname, 'src/components/404.html'),
      },
    },
  },
});
