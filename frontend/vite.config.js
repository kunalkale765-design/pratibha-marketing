import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

// Generate cache version from git hash + timestamp for reliable cache busting
const cacheVersion = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return Date.now().toString(36);
  }
})();

// Plugin to copy service-worker.js to build output with cache version injected
function serviceWorkerVersionPlugin() {
  return {
    name: 'sw-version',
    async writeBundle(options) {
      const { readFileSync, writeFileSync } = await import('fs');
      const outDir = options.dir || resolve(__dirname, 'dist');
      const swSrc = resolve(__dirname, 'src/service-worker.js');
      const swDest = resolve(outDir, 'service-worker.js');
      try {
        let content = readFileSync(swSrc, 'utf-8');
        // Replace hardcoded version with git-based version
        content = content.replace(
          /const CACHE_NAME = 'pratibha-v\d+'/,
          `const CACHE_NAME = 'pratibha-${cacheVersion}'`
        );
        writeFileSync(swDest, content);
      } catch (err) {
        console.warn('[sw-version] Could not process service worker:', err.message);
      }
    }
  };
}

export default defineConfig({
  root: 'src', // Set root to src/ so index.html files are found easily
  publicDir: '../public', // We don't have this yet, acts as static folder
  envDir: resolve(__dirname, '..'), // Load .env from project root
  plugins: [serviceWorkerVersionPlugin()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        orders: resolve(__dirname, 'src/pages/orders/index.html'),
        customers: resolve(__dirname, 'src/pages/customers/index.html'),
        products: resolve(__dirname, 'src/pages/products/index.html'),
        marketRates: resolve(__dirname, 'src/pages/market-rates/index.html'),
        login: resolve(__dirname, 'src/pages/auth/login.html'),
        signup: resolve(__dirname, 'src/pages/auth/signup.html'),
        resetPassword: resolve(__dirname, 'src/pages/auth/reset-password.html'),
        orderForm: resolve(__dirname, 'src/pages/order-form/index.html'),
        packing: resolve(__dirname, 'src/pages/packing/index.html'),
        reconciliation: resolve(__dirname, 'src/pages/reconciliation/index.html'),
        staffDashboard: resolve(__dirname, 'src/pages/staff-dashboard/index.html'),
        users: resolve(__dirname, 'src/pages/users/index.html'),
      }
    }
  },
  resolve: {
    alias: {
      '/css': resolve(__dirname, 'src/assets/css'),
      '/js': resolve(__dirname, 'src/js'),
      '/icons': resolve(__dirname, 'src/assets/icons'),
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
